'use strict';

var fs             = require('fs');                        // https://nodejs.org/api/fs.html
var moment         = require('moment');                    // https://www.npmjs.com/package/moment
var _              = require('lodash');                    // https://www.npmjs.com/package/lodash
var NodeCache      = require('node-cache');                // https://www.npmjs.com/package/node-cache
var CouchPotatoAPI = require('couchpotato-api');           // https://www.npmjs.com/package/couchpotato-api
var TelegramBot    = require('node-telegram-bot-api');     // https://www.npmjs.com/package/node-telegram-bot-api

var state  = require(__dirname + '/lib/state');         // handles command structure
var logger = require(__dirname + '/lib/logger');        // logs to file and console
var i18n   = require(__dirname + '/lib/lang');          // set up multilingual support
var config = require(__dirname + '/lib/config');        // the concised configuration
var acl    = require(__dirname + '/lib/acl');           // set up the acl file

/*
 * set up the telegram bot
 */
var bot = new TelegramBot(config.telegram.botToken, { polling: true });

/*
 * set up the couchpotato api
 */
var couchpotato = new CouchPotatoAPI({
  hostname: config.couchpotato.hostname, apiKey: config.couchpotato.apiKey,
  port: config.couchpotato.port, urlBase: config.couchpotato.urlBase,
  ssl: config.couchpotato.ssl, username: config.couchpotato.username,
  password: config.couchpotato.password
});

/*
 * set up a simple caching tool
 */
var cache = new NodeCache({ stdTTL: 120, checkperiod: 150 });

/*
get the bot name
 */
bot.getMe()
  .then(function(msg) {
    logger.info('couchpotato bot %s initialized', msg.username);
  })
  .catch(function(err) {
    throw new Error(err);
  });

/*
handle start command
 */
bot.onText(/\/start/, function(msg) {
  var fromId = msg.from.id;
  var username = msg.from.username || msg.from.first_name;

  verifyUser(fromId);

  var response = ['Hello ' + username + '!'];
  response.push('\n`/q [movie name]` to continue...');

  bot.sendMessage(fromId, response.join('\n'), {
    'parse_mode': 'Markdown',
    'selective': 2,
  });
});

/*
 * handle help command
 */
bot.onText(/\/help/, function(msg) {
  var fromId = msg.from.id;

  verifyUser(fromId);

  logger.info('user: %s, message: sent \'/help\' command', fromId);
  sendCommands(fromId);
});

/*
handle query command
 */
bot.onText(/\/[Ff](uery)? (.+)/, function(msg, match) {
  var fromId = msg.from.id;
  var movieName = match[2];

  verifyUser(fromId);

  couchpotato.get('movie.search', { 'q': movieName })
    .then(function(result) {
      if (!result.movies) {
        throw new Error('Could not find ' + movieName + ', try searching again');
      }

      return result.movies;
    })
    .then(function(movies) {
      logger.info('user: %s, message: requested to search for series "%s"', fromId, movieName);

      var movieList = [];
      var message = ['*Found ' + movies.length + ' movies:*'];
      var keyboardList = [];

      _.forEach(movies, function(n, key) {

        var id = key + 1;
        var title = n.original_title;
        var year = ('year' in n ? n.year : '');
        var rating = ('rating' in n ? ('imdb' in n.rating ? n.rating.imdb[0] + '/10' : '') : '');
        var movieId = ('imdb' in n ? n.imdb : n.tmdb_id);
        var thumb = ('images' in n ? ('poster' in n.images ? n.images.poster[0] : '') : '');
        var runtime = ('runtime' in n ? n.runtime : '');
        var onIMDb = ('via_imdb' in n ? true : false);
        var keyboardValue = title + (year ? ' - ' + year : '');

        movieList.push({
          'id': id,
          'title': title,
          'year': year,
          'rating': rating,
          'movie_id': movieId,
          'thumb': thumb,
          'via_imdb': onIMDb,
          'keyboard_value': keyboardValue
        });

        message.push(
          '*' + id + '*) ' +
          (onIMDb ? '[' + title + '](http://imdb.com/title/' + movieId + ')' : '[' + title + '](https://www.themoviedb.org/movie/' + movieId + ')') +
          (year ? ' - _' + year + '_' : '') +
          (rating ? ' - _' + rating + '_' : '') +
          (runtime ? ' - _' + runtime + 'm_' : '')
        );

        // One movie per row of custom keyboard
        keyboardList.push([keyboardValue]);
      });
      message.push('\nPlease select from the menu below.');

      // set cache
      cache.set('movieList' + fromId, movieList);
      cache.set('state' + fromId, state.couchpotato.MOVIE);

      return {
        message: message.join('\n'),
        keyboard: keyboardList
      };
    })
    .then(function(response) {
      bot.sendMessage(fromId, response.message, {
        'disable_web_page_preview': true,
        'parse_mode': 'Markdown',
        'selective': 2,
        'reply_markup': JSON.stringify({ keyboard: response.keyboard, one_time_keyboard: true })
      });
    })
    .catch(function(err) {
      replyWithError(fromId, err);
    });

});

/*
 Captures any and all messages, filters out commands, handles profiles and movies
 sent via the custom keyboard.
 */
bot.on('message', function(msg) {
  var fromId = msg.from.id;
  var message = msg.text;

  verifyUser(fromId);

  // If the message is a command, ignore it.
  if(msg.text[0] != '/') {
    // Check cache to determine state, if cache empty prompt user to start a movie search
    var currentState = cache.get('state' + fromId);
    if (!currentState) {
      return replyWithError(fromId, new Error('Try searching for a movie first with `/q movie name`'));
    } else {
      switch(currentState) {
        case state.couchpotato.MOVIE:
          logger.info('user: %s, message: choose the movie %s', fromId, message);
          handleMovie(fromId, message);
          break;
        case state.couchpotato.PROFILE:
          logger.info('user: %s, message: choose the profile "%s"', fromId, message);
          handleProfile(fromId, message);
          break;
        case state.admin.REVOKE_CONFIRM:
          verifyAdmin(fromId);
          logger.info('user: %s, message: choose the revoke confirmation "%s"', fromId, message);
          handleRevokeUserConfirm(fromId, message);
          break;
        case state.admin.UNREVOKE:
          verifyAdmin(fromId);
          logger.info('user: %s, message: choose to unrevoke user "%s"', fromId, message);
          handleUnRevokeUser(fromId, message);
          break;
        case state.admin.UNREVOKE_CONFIRM:
          verifyAdmin(fromId);
          logger.info('user: %s, message: choose the unrevoke confirmation "%s"', fromId, message);
          handleUnRevokeUserConfirm(fromId, message);
          break;
        default:
          return replyWithError(fromId, new Error('Unsure what\'s going on, use the `/clear` command and start over.'));
      }
    }
  }
});

/*
 * handle full search of movies
 */
bot.onText(/\/wanted/, function(msg) {
  var fromId = msg.from.id;

  verifyAdmin(fromId);

  couchpotato.get('movie.searcher.full_search')
    .then(function(result) {
      bot.sendMessage(fromId, 'Starting full search for all wanted movies.');
    }).catch(function(err) {
      replyWithError(fromId, err);
    });
});

/*
 * handle clear command
 */
bot.onText(/\/clear/, function(msg) {
  var fromId = msg.from.id;

  verifyUser(fromId);

  logger.info('user: %s, message: sent \'/clear\' command', fromId);
  clearCache(fromId);
  logger.info('user: %s, message: \'/clear\' command successfully executed', fromId);

  bot.sendMessage(fromId, 'All previously sent commands have been cleared, yey!', {
    'reply_markup': {
      'hide_keyboard': true
    }
  });
});

/*
 * handle authorization
 */
bot.onText(/\/auth (.+)/, function(msg, match) {
  var fromId = msg.from.id;
  var password = match[1];

  var message = [];

  if (isAuthorized(fromId)) {
    message.push('Already authorized.');
    message.push('Type /start to begin.');
    return bot.sendMessage(fromId, message.join('\n'));
  }

  // make sure the user is not banned
  if (isRevoked(fromId)) {
    message.push('Your access has been revoked and cannot reauthorize.');
    message.push('Please reach out to the bot owner for support.');
    return bot.sendMessage(fromId, message.join('\n'));
  }

  if (password !== config.bot.password) {
    return replyWithError(fromId, new Error('Invalid password.'));
  }

  acl.allowedUsers.push(msg.from);
  updateACL();

  if (acl.allowedUsers.length === 1) {
    promptOwnerConfig(fromId);
  }

  message.push('You have been authorized.');
  message.push('Type /start to begin.');
  bot.sendMessage(fromId, message.join('\n'));

  if (config.bot.owner) {
    bot.sendMessage(config.bot.owner, getTelegramName(msg.from) + ' has been granted access.');
  }
});

/*
 * handle users
 */
bot.onText(/\/users/, function(msg) {
  var fromId = msg.from.id;

  verifyAdmin(fromId);

  var response = ['*Allowed Users:*'];
  _.forEach(acl.allowedUsers, function(n, key) {
    response.push('*' + (key + 1) + '*) ' + getTelegramName(n));
  });

  bot.sendMessage(fromId, response.join('\n'), {
    'disable_web_page_preview': true,
    'parse_mode': 'Markdown',
    'selective': 2,
  });
});

/*
 * handle user access revocation
 */
bot.onText(/\/revoke/, function(msg) {
  var fromId = msg.from.id;

  verifyAdmin(fromId);

  var opts = {};

  if (!acl.allowedUsers.length) {
    var message = 'There aren\'t any allowed users.';

    opts = {
      'disable_web_page_preview': true,
      'parse_mode': 'Markdown',
      'selective': 2,
    };

    bot.sendMessage(fromId, message, opts);
  }

  var keyboardList = [], keyboardRow = [], revokeList = [];
  var response = ['*Allowed Users:*'];
  _.forEach(acl.allowedUsers, function(n, key) {
    revokeList.push({
      'id': key + 1,
      'userId': n.id,
      'keyboardValue': getTelegramName(n)
    });
    response.push('*' + (key + 1) + '*) ' + getTelegramName(n));

    keyboardRow.push(getTelegramName(n));
    if (keyboardRow.length === 2) {
      keyboardList.push(keyboardRow);
      keyboardRow = [];
    }
  });

  response.push(i18n.__('selectFromMenu'));


  if (keyboardRow.length === 1) {
    keyboardList.push([keyboardRow[0]]);
  }

  // set cache
  cache.set('state' + fromId, state.admin.REVOKE);
  cache.set('revokeUserList' + fromId, revokeList);

  bot.sendMessage(fromId, response.join('\n'), {
    'disable_web_page_preview': true,
    'parse_mode': 'Markdown',
    'selective': 2,
    'reply_markup': JSON.stringify({ keyboard: keyboardList, one_time_keyboard: true }),
  });
});

/*
 * handle user access unrevocation
 */
bot.onText(/\/unrevoke/, function(msg) {
  var fromId = msg.from.id;

  verifyAdmin(fromId);

  var opts = {};

  if (!acl.revokedUsers.length) {
    var message = 'There aren\'t any revoked users.';

    bot.sendMessage(fromId, message, {
      'disable_web_page_preview': true,
      'parse_mode': 'Markdown',
      'selective': 2,
    });
  }

  var keyboardList = [], keyboardRow = [], revokeList = [];
  var response = ['*Revoked Users:*'];
  _.forEach(acl.revokedUsers, function(n, key) {
    revokeList.push({
      'id': key + 1,
      'userId': n.id,
      'keyboardValue': getTelegramName(n)
    });

    response.push('*' + (key + 1) + '*) ' + getTelegramName(n));

    keyboardRow.push(getTelegramName(n));
    if (keyboardRow.length == 2) {
      keyboardList.push(keyboardRow);
      keyboardRow = [];
    }
  });

  response.push(i18n.__('selectFromMenu'));

  if (keyboardRow.length === 1) {
    keyboardList.push([keyboardRow[0]]);
  }

  // set cache
  cache.set('state' + fromId, state.admin.UNREVOKE);
  cache.set('unrevokeUserList' + fromId, revokeList);

  bot.sendMessage(fromId, response.join('\n'), {
    'disable_web_page_preview': true,
    'parse_mode': 'Markdown',
    'selective': 2,
    'reply_markup': JSON.stringify({ keyboard: keyboardList, one_time_keyboard: true })
  });
});

bot.onText(/\/library\s?(.+)?/, function(msg, match) {
  var fromId = msg.from.id;
  var query = match[1] || 0;
  /*
  status	array or csv	Filter media by status. Example:"active,done"
  search	string	Search media title
  release_status	array or csv	Filter media by status of its releases. Example:"snatched,available"
  limit_offset	string	Limit and offset the media list. Examples: "50" or "50,30"
  type	string	Media type to filter on.
  starts_with	string	Starts with these characters. Example: "a" returns all media starting with the letter "a"
  */

  couchpotato.get('media.list')
    .then(function(result) {
      logger.info('user: %s, message: all movies', fromId);

      var response = [];
      _.forEach(result.movies, function(n, key) {
        var movieId = (n.imdb ? n.imdb : n.tmdb_id);
        var onIMDb = (n.via_imdb ? true : false);
        var movie = (onIMDb ? '[' + n.title + '](http://imdb.com/title/' + movieId + ')' : '[' + n.title + '](https://www.themoviedb.org/movie/' + movieId + ')');

        if (query) {
          if (n.title.search( new RegExp(query, 'i') ) !== -1) {
            response.push(movie);
          }
        } else {
          response.push(movie);
        }
      });

      if (!response.length) {
        return replyWithError(fromId, new Error('Unable to locate ' + query + ' in couchpotato library'));
      }

      response.sort();

      if (query) {
        // add title to begining of the array
        response.unshift('*Found matching results in CouchPotato library:*');
      }

      if (response.length > 50) {
        var splitReponse = _.chunk(response, 50);
        splitReponse.sort();
        _.forEach(splitReponse, function(n) {
          n.sort();
          bot.sendMessage(fromId, n.join('\n'), { 'parse_mode': 'Markdown', 'selective': 2 });
        });
      } else {
        bot.sendMessage(fromId, response.join('\n'), { 'parse_mode': 'Markdown', 'selective': 2 });
      }
    })
    .catch(function(err) {
      replyWithError(fromId, err);
    })
    .finally(function() {
      clearCache(fromId);
    });

});

function handleMovie(userId, movieDisplayName) {
  var movieList = cache.get('movieList' + userId);
  if (!movieList) {
    return replyWithError(userId, new Error('Something went wrong, try searching again'));
  }

  var movie = _.filter(movieList, function(item) { return item.keyboard_value === movieDisplayName; })[0];
  if(!movie){
    return replyWithError(userId, new Error('Could not find the movie with title "' + movieDisplayName + '"'));
  }

  // create a workflow
  var workflow = new (require('events').EventEmitter)();

  // check for existing movie
  workflow.on('checkCouchPotatoMovie', function () {
    couchpotato.get('media.list')
      .then(function(result) {
        logger.info('user: %s, message: looking for existing movie', userId);

        var existingMovie = _.filter(result.movies, function(item) {
          return item.info.imdb == movie.movie_id || item.info.tmdb_id == movie.movie_id;
        })[0];

        if (existingMovie) {
          throw new Error('Movie already exists and is already being tracked by CouchPotato');
        }
        workflow.emit('getCouchPotatoProfile');
      }).catch(function(err) {
        replyWithError(userId, err);
      });
  });

  workflow.on('getCouchPotatoProfile', function () {

    // set movie option to cache
    cache.set('movieId' + userId, movie.id);

    couchpotato.get('profile.list')
      .then(function(result) {
        if (!result.list) {
          throw new Error('could not get profiles, try searching again');
        }

        if (!cache.get('movieList' + userId)) {
          throw new Error('could not get previous movie list, try searching again');
        }

        return result.list;
      })
      .then(function(profiles) {
        logger.info('user: %s, message: requested to get profile list with ' + profiles.length + ' entries', userId);

        // only select profiles that are enabled in CP
        var enabledProfiles = _.filter(profiles, function(item) { return (typeof item.hide == 'undefined' || item.hide == false); });

        var response = ['*Found ' + enabledProfiles.length + ' profiles:*\n'];
        var profileList = [], keyboardList = [], keyboardRow = [];
        _.forEach(enabledProfiles, function(n, key) {
          profileList.push({
            'id': key,
            'label': n.label,
            'hash': n._id
          });

          response.push('*' + (key + 1) + '*) ' + n.label);

          // Profile names are short, put two on each custom
          // keyboard row to reduce scrolling
          keyboardRow.push(n.label);
          if (keyboardRow.length === 2) {
            keyboardList.push(keyboardRow);
            keyboardRow = [];
          }
        });

        if (keyboardRow.length === 1 && keyboardList.length === 0) {
          keyboardList.push([keyboardRow[0]]);
        }
        response.push('\n\nPlease select from the menu below.');


        // set cache
        cache.set('movieProfileList' + userId, profileList);
        cache.set('state' + userId, state.couchpotato.PROFILE);

        return {
          message: response.join('\n'),
          keyboard: keyboardList
        };
      })
      .then(function(response) {
        bot.sendMessage(userId, response.message, {
          'disable_web_page_preview': true,
          'parse_mode': 'Markdown',
          'selective': 2,
          'reply_markup': JSON.stringify({ keyboard: response.keyboard, one_time_keyboard: true })
        });
      })
      .catch(function(err) {
        replyWithError(userId, err);
      });

    });

    /**
     * Initiate the workflow
     */
    workflow.emit('checkCouchPotatoMovie');

}

function handleProfile(userId, profileName) {
  var profileList = cache.get('movieProfileList' + userId);
  var movieId = cache.get('movieId' + userId);
  var movieList = cache.get('movieList' + userId);
  if (!profileList || !movieList || !movieId) {
    return replyWithError(userId, new Error('Something went wrong, try searching again'));
  }

  var profile = _.filter(profileList, function(item) { return item.label === profileName; })[0];
  if(!profile) {
    return replyWithError(userId, new Error('Could not find the profile "' + profileName + '"'));
  }

  var movie = _.filter(movieList, function(item) { return item.id === movieId; })[0];

  couchpotato.get('movie.add', {
      'identifier': movie.movie_id,
      'title': movie.title,
      'profile_id': profile.hash
    })
    .then(function(result) {
      logger.info('user: %s, message: added movie "%s"', userId, movie.title);

      if (!result.success) {
        throw new Error('could not add movie, try searching again.');
      }

      bot.sendMessage(userId, '[Movie added!](' + movie.thumb + ')', {
        'selective': 2,
        'parse_mode': 'Markdown',
        'reply_markup': {
          'hide_keyboard': true
        }
      });
    })
    .catch(function(err) {
      replyWithError(userId, err);
    })
    .finally(function() {
      clearCache(userId);
    });
}

function handleRevokeUser(userId, revokedUser) {

  logger.info('user: %s, message: selected revoke user %s', userId, revokedUser);

  var keyboardList = [];
  var response = ['Are you sure you want to revoke access to ' + revokedUser + '?'];
  keyboardList.push(['NO']);
  keyboardList.push(['yes']);

  // set cache
  cache.set('state' + userId, state.admin.REVOKE_CONFIRM);
  cache.set('revokedUserName' + userId, revokedUser);

  bot.sendMessage(userId, response.join('\n'), {
    'disable_web_page_preview': true,
    'parse_mode': 'Markdown',
    'selective': 2,
    'reply_markup': JSON.stringify({ keyboard: keyboardList, one_time_keyboard: true }),
  });
}

function handleRevokeUserConfirm(userId, revokedConfirm) {

  logger.info('user: %s, message: selected revoke confirmation %s', userId, revokedConfirm);

  var revokedUser = cache.get('revokedUserName' + userId);
  var opts = {};
  var message = '';

  if (revokedConfirm === 'NO' || revokedConfirm === 'no') {
      clearCache(userId);
      message = 'Access for ' + revokedUser + ' has *NOT* been revoked.';
      return bot.sendMessage(userId, message, {
        'disable_web_page_preview': true,
         'parse_mode': 'Markdown',
        'selective': 2,
      });
  }

  var revokedUserList = cache.get('revokeUserList' + userId);
  var i = revokedUserList.map(function(e) { return e.keyboardValue; }).indexOf(revokedUser);
  var revokedUserObj = revokedUserList[i];
  var j = acl.allowedUsers.map(function(e) { return e.id; }).indexOf(revokedUserObj.userId);

  acl.revokedUsers.push(acl.allowedUsers[j]);
  acl.allowedUsers.splice(j, 1);
  updateACL();

  message = 'Access for ' + revokedUser + ' has been revoked.';

  bot.sendMessage(userId, message, {
    'disable_web_page_preview': true,
    'parse_mode': 'Markdown',
    'selective': 2
  });

  clearCache(userId);
}

function handleUnRevokeUser(userId, revokedUser) {

  var keyboardList = [];
  var response = ['Are you sure you want to unrevoke access for ' + revokedUser + '?'];
  keyboardList.push(['NO']);
  keyboardList.push(['yes']);

  // set cache
  cache.set('state' + userId, state.admin.UNREVOKE_CONFIRM);
  cache.set('revokedUserName' + userId, revokedUser);

  logger.info('user: %s, message: selected unrevoke user %s', userId, revokedUser);

  var keyboard = {
    keyboard: keyboardList,
    one_time_keyboard: true
  };

  bot.sendMessage(userId, response.join('\n'), {
    'disable_web_page_preview': true,
    'parse_mode': 'Markdown',
    'selective': 2,
    'reply_markup': JSON.stringify({keyboard: keyboardList, one_time_keyboard: true })
  });
}

function handleUnRevokeUserConfirm(userId, revokedConfirm) {

  logger.info('user: %s, message: selected unrevoke confirmation %s', userId, revokedConfirm);

  var revokedUser = cache.get('revokedUserName' + userId);
  var opts = {};
  var message = '';
  if (revokedConfirm === 'NO' || revokedConfirm === 'no') {
      clearCache(userId);
      message = 'Access for ' + revokedUser + ' has *NOT* been unrevoked.';
      return bot.sendMessage(userId, message, {
        'disable_web_page_preview': true,
        'parse_mode': 'Markdown',
        'selective': 2,
      });
  }

  var unrevokedUserList = cache.get('unrevokeUserList' + userId);
  var i = unrevokedUserList.map(function(e) { return e.keyboardValue; }).indexOf(revokedUser);
  var unrevokedUserObj = unrevokedUserList[i];
  var j = acl.revokedUsers.map(function(e) { return e.id; }).indexOf(unrevokedUserObj.userId);
  acl.revokedUsers.splice(j, 1);
  updateACL();

  message = 'Access for ' + revokedUser + ' has been unrevoked.';

  bot.sendMessage(userId, message, {
    'disable_web_page_preview': true,
    'parse_mode': 'Markdown',
    'selective': 2,
  });

  clearCache(userId);
}

/*
 * save access control list
 */
function updateACL() {
  fs.writeFile(__dirname + '/acl.json', JSON.stringify(acl), function(err) {
    if (err) {
      throw new Error(err);
    }

    logger.info('the access control list was updated');
  });
}

/*
 * verify user can use the bot
 */
function verifyUser(userId) {
  if (_.some(acl.allowedUsers, { 'id': userId }) !== true) {
    return replyWithError(userId, new Error(i18n.__('notAuthorized')));
  }
}

/*
 * verify admin of the bot
 */
function verifyAdmin(userId) {
  if (isAuthorized(userId)) {
    promptOwnerConfig(userId);
  }

  if (config.bot.owner !== userId) {
    return replyWithError(userId, new Error(i18n.__('adminOnly')));
  }
}

function isAdmin(userId) {
  if (config.bot.owner === userId) {
    return true;
  }
  return false;
}

/*
 * check to see is user is authenticated
 * returns true/false
 */
function isAuthorized(userId) {
  return _.some(acl.allowedUsers, { 'id': userId });
}

/*
 * check to see is user is banned
 * returns true/false
 */
function isRevoked(userId) {
  return _.some(acl.revokedUsers, { 'id': userId });
}

function promptOwnerConfig(userId) {
  if (!config.bot.owner) {
    var message = ['Your User ID: ' + userId];
    message.push('Please add your User ID to the config file field labeled \'owner\'.');
    message.push('Please restart the bot once this has been updated.');
    bot.sendMessage(userId, message.join('\n'));
  }
}

/*
 * handle removing the custom keyboard
 */
function replyWithError(userId, err) {

  logger.warn('user: %s message: %s', userId, err.message);

  bot.sendMessage(userId, '*Oh no!* ' + err, {
    'parse_mode': 'Markdown',
    'reply_markup': {
      'hide_keyboard': true
    }
  });
}

/*
 * clear caches
 */
function clearCache(userId) {
  var cacheItems = [
    'movieId', 'movieList', 'movieProfileList',
    'state', 'revokedUserName', 'revokeUserList'
  ];

  _(cacheItems).forEach(function(item) {
    cache.del(item + userId);
  });
}

/*
 * get telegram name
 */
function getTelegramName(user) {
   return user.username || (user.first_name + (' ' + user.last_name || ''));
}

/*
 * Send Commands To chat
 */
function sendCommands(fromId) {
  var response = ['Hello ' + getTelegramName(fromId) + '!'];
  response.push('Below is a list of commands you have access to:');
  response.push('\n*General commands:*');
  response.push('/start to start this bot');
  response.push('/help to for this list of commands');
  response.push('`/q [movie name]` search for a movie');
  response.push('`/library [movie name]` search CouchPotato library');
  response.push('/clear clear all previous commands');

  if (isAdmin(fromId)) {
    response.push('\n*Admin commands:*');
    response.push('/wanted search all missing/wanted movies');
    response.push('/users list users');
    response.push('/revoke revoke user from bot');
    response.push('/unrevoke un-revoke user from bot');
  }

  return bot.sendMessage(fromId, response.join('\n'), { 'parse_mode': 'Markdown', 'selective': 2 });
}
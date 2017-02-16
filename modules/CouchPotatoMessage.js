/* global __dirname */

'use strict';

var _                 = require('lodash');            // https://www.npmjs.com/package/lodash
var moment            = require('moment');            // https://www.npmjs.com/package/moment
var CouchPotatoAPI    = require('couchpotato-api');   // https://www.npmjs.com/package/couchpotato-api

/*
 * libs
 */
var i18n      = require(__dirname + '/../lib/lang');      // set up multilingual support
var config    = require(__dirname + '/../lib/config');    // the concised configuration
var state     = require(__dirname + '/../lib/state');     // handles command structure
var logger    = require(__dirname + '/../lib/logger');    // logs to file and console
var acl       = require(__dirname + '/../lib/acl');       // set up the acl file

/*
 * initalize the class
 */
function CouchPotatoMessage(bot, user, cache) {
  this.bot      = bot;
  this.user     = user;
  this.cache    = cache;
  this.adminId  = config.bot.owner;
  this.username = this.user.username || (this.user.first_name + (' ' + this.user.last_name || ''));

  this.couchpotato = new CouchPotatoAPI({
    hostname : config.couchpotato.hostname, 
    apiKey   : config.couchpotato.apiKey,
    port     : config.couchpotato.port, 
    urlBase  : config.couchpotato.urlBase,
    ssl      : config.couchpotato.ssl, 
    username : config.couchpotato.username,
    password : config.couchpotato.password
  });
  
}

/*
 * handle the flow of adding a new movie
 */
CouchPotatoMessage.prototype.sendMoviesList = function(movieName) {
  var self = this;
  
  logger.info(i18n.__('logCouchPotatoQueryCommandSent', self.username));
  
  self.couchpotato.get('movie.search', { 'q': movieName }).then(function(result) {
      
      if (!result.movies) {
        throw new Error(i18n.__('errorCouchPotatoMovieNotFound', movieName));
      }
  
      var movies = result.movies;

      logger.info(i18n.__('logCouchPotatoUserMovieRequested', self.username, movieName));
  
      var movieList = [], keyboardList = [];
      var response = [i18n.__('botChatCouchPotatoFoundMovies', movies.length)];
  
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
  
        response.push(
          '*' + id + '*) ' +
          (onIMDb ? '[' + title + '](http://imdb.com/title/' + movieId + ')' : '[' + title + '](https://www.themoviedb.org/movie/' + movieId + ')') +
          (year ? ' - _' + year + '_' : '') +
          (rating ? ' - _' + rating + '_' : '') +
          (runtime ? ' - _' + runtime + 'm_' : '')
        );
        
        // One movie per row of custom keyboard
        keyboardList.push([keyboardValue]);
        
      });
      
      response.push(i18n.__('selectFromMenu'));
      logger.info(i18n.__("logSonarrFoundSeries2", self.username, keyboardList.join(',')));
  
      // set cache
      self.cache.set('movieList' + self.user.id, movieList);
      self.cache.set('state' + self.user.id, state.couchpotato.CONFIRM);
      
      return self._sendMessage(message.join('\n'), keyboardList);
      
    })
    .catch(function(error) {
      return self._sendMessage(error);
    });
};

CouchPotatoMessage.prototype.confirmMovieSelect = function(displayName) {
  var self = this;

  var moviesList = self.cache.get('movieList' + self.user.id);

  if (!moviesList) {
    return self._sendMessage(new Error(i18n.__('errorSonarrWentWrong')));
  }
  
  // TO CONTINUE !!!!
  
};

/*
 * private methods
 */
CouchPotatoMessage.prototype._sendMessage = function(message, keyboard) {
  var self = this;
  keyboard = keyboard || null;

  var options;
  if (message instanceof Error) {
    logger.warn(i18n.__("logMessageClear", self.username, message.message));

    message = message.message;
    options = {
      'parse_mode': 'Markdown',
      'reply_markup': {
        'hide_keyboard': true
      }
    };
  } else {
    options = {
      // 'disable_web_page_preview': true,
      'parse_mode': 'Markdown',
      'selective': 2,
      'reply_markup': JSON.stringify( { keyboard: keyboard, one_time_keyboard: true })
    };
  }

  return self.bot.sendMessage(self.user.id, message, options);
};

module.exports = CouchPotatoMessage;

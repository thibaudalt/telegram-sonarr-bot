# telegram-couchpotato-sonarr-bot

Bot which lets you or others add :
 - series to [Sonarr](https://sonarr.tv/) via the messaging service [Telegram](https://telegram.org/)
 - movies to [CouchPotato](https://couchpota.to/) via the messaging service [Telegram](https://telegram.org/)

Contact [@BotFather](http://telegram.me/BotFather) on Telegram to create and get a bot token.

Getting Started
---------------

## Prerequisites
- [Node.js](http://nodejs.org) v4.2.x
- [Git](https://git-scm.com/downloads) (optional)

## Installation

```bash
# Clone the repository
git clone https://github.com/thibaudalt/telegram-couchpotato-sonarr-bot
```

```bash
# Install dependencies
cd telegram-couchpotato-sonarr-bot
npm install
```

```bash
# Copy acl.json.template to acl.json
cp acl.json.template acl.json
```

```bash
# Copy config.json.template to config.json
cp config.json.template config.json
```

In `config.json` fill in the values below:

Telegram:
- **botToken** your Telegram Bot token

Bot:
- **password** the password to access the bot
- **owner** your Telegram user ID. (you can fill this in later)
- **notifyId** Telegram ID used for notifications. (optional; you can fill this in later)

Sonarr:
- **hostname**: hostname where Sonarr runs (required)
- **apiKey**: Your API to access Sonarr (required)
- **port**: port number Sonarr is listening on (optional, default: 5050)
- **urlBase**: URL Base of Sonarr (optional, default: empty)
- **ssl**: Set to true if you are connecting via SSL (default: false)
- **username**: HTTP Auth username (default: empty)
- **password**: HTTP Auth password (default: empty)

CouchPotato:
- **hostname**: hostname where CouchPotato runs (required)
- **apiKey**: Your API to access CouchPotato (required)
- **port**: port number CouchPotato is listening on (optional, default: 5050)
- **urlBase**: URL Base of CouchPotato (optional, default: empty)
- **ssl**: Set to true if you are connecting via SSL (default: false)
- **username**: HTTP Auth username (default: empty)
- **password**: HTTP Auth password (default: empty)

**Important note**: Restart the bot after making any changes to the `config.json` file.

```bash
# Start the bot
node app.js
```

## Usage (commands)

### First use
Send the bot the `/auth` command with the password you created in `config.json`

### Adding a series

Send the bot a message with the series name

`/q game of`

The bot will reply with

```
Found 6 series:
1) Game of Crowns - 2014
2) Game of Thrones - 2011
3) Game of Silence
4) Game of Silence (TR) - 2012
5) The Genius Game - 2013
6) More Than A Game - The Story of Football
```

Use the custom keyboard to select the series.

![Step One](https://raw.githubusercontent.com/thibaudalt/telegram-couchpotato-sonarr-bot/master/examples/so-step-1.png)

The bot will ask you for the quality

```
Found 2 profiles:
1) SD 2) HD
```

Send the profile using the custom keyboard

![Step Two](https://raw.githubusercontent.com/thibaudalt/telegram-couchpotato-sonarr-bot/master/examples/so-step-2.png)

The bot will ask you where the path you want the series to go

```
Found 2 folders:
1) /Television/Airing/
2) /Television/Archived/
```

Send the folder using the custom keyboard

![Step Three](https://raw.githubusercontent.com/thibaudalt/telegram-couchpotato-sonarr-bot/master/examples/so-step-3.png)

Lastly, the bot will ask you which seasons you would like to monitor/download

```
Select which seasons to monitor:
1) future
2) all
3) none
4) latest
5) first
```

Send the monitor type using the custom keyboard

![Step Four](https://raw.githubusercontent.com/thibaudalt/telegram-couchpotato-sonarr-bot/master/examples/so-step-4.png)

If everything goes well, you'll see a text from the bot saying the series was added.

![Step Five](https://raw.githubusercontent.com/thibaudalt/telegram-couchpotato-sonarr-bot/master/examples/so-step-5.png)

### Notifications
Sonarr can be setup to send notifications to a user or a group chat when new content is added.  

* In Sonarr go to `Settings` > `Connect` > `+` > `Custom Script`
* In the Name field enter `Telegram`
* In the Path field enter the full path to your node.js installation i.e. `C:\Program Files\nodejs\node.exe`
* In the Arguments field enter the full path to `sonarr_notify.js` i.e `C:\bots\telegram-couchpotato-sonarr-bot\sonarr_notify.js`
* Start the bot by running `node app.js`
* Open a new chat or group chat with the bot and type `/cid` 
* Note the Chat ID
* Open `config.json` and enter the Chat ID next to `notifyId`
* Restart the bot
* The specified chat will now begin receiving notifications for newly added content

### Adding a movie

Send the bot a message with the movie name

`/q ernest goes to`

The bot will reply with

```
Found 5 movies:
1) Ernest Goes to Camp - 1987 - 5.4/10 - 92m
2) Ernest Goes to Jail - 1990 - 5.3/10 - 81m
3) Ernest Goes to Africa - 1997 - 4.7/10 - 90m
4) Ernest Goes to School - 1994 - 4.5/10 - 89m
5) Ernest Goes to Splash Mountain - 1989 - 6.7/10 - 21m
```

Use the custom keyboard to select the movie.

![Step One](https://raw.githubusercontent.com/thibaudalt/telegram-couchpotato-sonarr-bot/master/examples/cp-step-1.png)

The bot will then ask you for the quality

```
1) Any 2) Screener 3) DVD-Rip 4) BR-Rip 5) 720p 6) 1080p
```

Send the profile using the custom keyboard

![Step Two](https://raw.githubusercontent.com/thibaudalt/telegram-couchpotato-sonarr-bot/master/examples/cp-step-2.png)

If everything goes well, you'll see a text from the bot saying the movie was added.

![Step Three](https://raw.githubusercontent.com/thibaudalt/telegram-couchpotato-sonarr-bot/master/examples/cp-step-3.png)

### Additional commands
* `/upcoming` shows upcoming episodes, has a day parameter, defaults to 3 days
* `/library` search Sonarr library for existing shows
* `/help` show available commands
* `/clear` clear all previous commands and cache

### Admin commands
* `/wanted` search all missing/wanted episodes
* `/rss` perform an RSS Sync
* `/refresh` refreshes all series
* `/users` list users
* `/revoke` revoke user from bot
* `/unrevoke` un-revoke user from bot
* `/cid` gets current chat id

## Docker
Alternatively you may use Docker to start the bot
```
docker run --name telegram-couchpotato-sonarr-bot \
  -e TELEGRAM_BOTTOKEN=
  -e BOT_PASSWORD=
  -e BOT_OWNER=
  -e BOT_NOTIFYID=
  -e BOT_MAXRESULTS=
  -e SONARR_HOST=
  -e SONARR_APIKEY=
  -e SONARR_PORT=
  -e SONARR_URLBASE=
  -e SONARR_SSL=
  -e SONARR_USERNAME=
  -e SONARR_PASSWORD=
  telegram-couchpotato-sonarr-bot
```

**Prebuilt** Docker image for this bot can be found [here](https://hub.docker.com/r/subzero79/docker-telegram-couchpotato-sonarr-bot), thanks [@subzero79](https://github.com/subzero79)

## License
(The MIT License)

Copyright (c) 2015 Thibaud Alt <thibaud.alt@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

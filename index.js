var firebase = require('firebase');
firebase.initializeApp({
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID
});

var Botkit = require('botkit');
var controller = Botkit.slackbot();
controller.configureSlackApp({
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  redirectUri: 'http://localhost:3000/slack/callback',
  scopes: ['commands']
});

var request = require('request');
var express = require('express');
var app = express()
var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.listen(process.env.PORT || 3000, function () {});

var regexEmoji = require("regex-emoji")
var matchAll = require("match-all")

// TODO: Handle the res.send for success and failure
app.get('/slack/callback', function(req, res) {
  var url = 'https://slack.com/api/oauth.access?';
  url += 'client_id=' + process.env.SLACK_CLIENT_ID;
  url += '&client_secret=' + process.env.SLACK_CLIENT_SECRET;
  url += '&code=' + req.query.code;

  request(url, function (error, response, body) {
    if (error || response.statusCode != 200) {
      console.log('Request Error: ' + error)
    } else {
      var data = JSON.parse(body)
      if (!data.ok) {
        console.log('Slack OAuth Error: ' + data.error)
      } else {
        var team = {}
        team[data.team_id] = {
          access_token: data.access_token,
          scope: data.scope,
          user_id: data.user_id,
          team_id: data.team_id,
          team_name: data.team_name
        }

        firebase.database().ref('/slack/').update(team, function(error) {
          if (error) {
            console.log('Firebase Error: ' + error)
          } else {
            console.log(team[data.team_id].team_name + ' was added to Firebase')
            res.send('Hello World!');
          }
        });
      }
    }
  });
});

// { token: 'LLaOadhqMhUZuZg6ZQVSqZ2W',
// 2016-10-23T04:55:05.815651+00:00 app[web.1]:   team_id: 'T0U3CCQJE',
// 2016-10-23T04:55:05.815652+00:00 app[web.1]:   team_domain: 'paralleltracks',
// 2016-10-23T04:55:05.815653+00:00 app[web.1]:   channel_id: 'D1KENTX0S',
// 2016-10-23T04:55:05.815658+00:00 app[web.1]:   channel_name: 'directmessage',
// 2016-10-23T04:55:05.815658+00:00 app[web.1]:   user_id: 'U0VMY8MK9',
// 2016-10-23T04:55:05.815659+00:00 app[web.1]:   user_name: 'dan',
// 2016-10-23T04:55:05.815660+00:00 app[web.1]:   command: '/firesong',
// 2016-10-23T04:55:05.815660+00:00 app[web.1]:   text: 'hay',
// 2016-10-23T04:55:05.815662+00:00 app[web.1]:   response_url: 'https://hooks.slack.com/commands/T0U3CCQJE/95004450980/izDylvzhTgQG0gpZtpXLOqVH' }

app.post('/slack/firesong', function(req, res) {
  var emojis = matchAll(req.body.text, regexEmoji()).toArray()
  findMatch(emojis, function(message) {
    res.send(message);
  })
});

app.get('/slack/firesong-add', function(req, res) {
  console.log(req)
  res.send('Hello World firesong-add!');
});

function findMatch(emojis, callback) {
  if (emojis.length == 0) {
    callback({
      'response_type': 'ephemeral',
      'text': 'No emojis were detected in you message. Try this format: `/firesong :fire:`',
    })
  } else if (emojis.length == 1) {
    createMessage(emojis[0], function(message) {
      callback(message)
    })
  } else {
    var combo = emojis.join('||')
    createMessage(combo, function(message) {
      callback(message)
    })
  }
}

function createMessage(emoji, callback) {
  getSongURL(emoji, function(url, error) {
    if (error) {
      callback({
        'response_type': 'ephemeral',
        'text': "No songs match that emoji, let's make a new match:\n`/firesong-add :" + emoji + ": [enter a Spotify URI (spotify:track:2uljPrNySotVP1d42B30X2)]`",
      })
    } else {
      callback({
        'response_type': 'in_channel',
        'text': ':' + emoji + ':',
        'attachments': [
          {
            'text': url
          }
        ]
      })
    }
  })
}

function getSongURL(emoji, callback) {
  var ref = firebase.database().ref('/emojis')
  ref.once('value', function(data) {
    var songs = data.val()[emoji]
    if (!songs) {
      callback(null, true)
    } else {
      var url
      if (songs.length > 1) {
        url = songs[Math.floor(Math.random() * songs.length)].url
      } else {
        url = songs.url
      }
      callback(url)
    }
  })
}

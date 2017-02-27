// Routing
var request = require('request');
var express = require('express');
var path = require('path');
var app = express()
var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.listen(process.env.PORT || 3000, function() {});

// Firebase
var firebase = require('firebase');
firebase.initializeApp({
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID
});

// Botkit
var Botkit = require('botkit');
var controller = Botkit.slackbot();
controller.configureSlackApp({
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  redirectUri: 'http://localhost:3000/slack/callback',
  scopes: ['commands']
});

// Genius
var Genius = require('node-genius')
var genius = new Genius(process.env.GENIUS_ACCESS_TOKEN)

// Mixpanel
var Mixpanel = require('mixpanel');
var mixpanel = Mixpanel.init(process.env.MIXPANEL_KEY);

// Routes
app.get('/', function(req, res) {
  res.sendFile(__dirname + '/public/index.html')
})

app.get('*', function(req, res) {
  res.sendFile(__dirname + '/public/index.html')
})

app.get('/success', function (req, res) {
    res.sendFile(__dirname + '/public/success.html')
});

app.get('/fail', function (req, res) {
    res.sendFile(__dirname + '/public/fail.html')
});

app.get('/privacy', function (req, res) {
    res.sendFile(__dirname + '/public/privacy.html')
});

// Slack Authentication
app.get('/slack/callback', function(req, res) {
  var url = 'https://slack.com/api/oauth.access?';
  url += 'client_id=' + process.env.SLACK_CLIENT_ID;
  url += '&client_secret=' + process.env.SLACK_CLIENT_SECRET;
  url += '&code=' + req.query.code;

  request(url, function (error, response, body) {
    if (error || response.statusCode != 200) {
      console.log('Request Error: ' + error)
      res.sendFile(__dirname + '/public/failure.html')
    } else {
      var data = JSON.parse(body)
      if (!data.ok) {
        console.log('Slack OAuth Error: ' + data.error)
        res.sendFile(__dirname + '/public/failure.html')
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
            res.sendFile(__dirname + '/public/failure.html')
          } else {
            console.log(team[data.team_id].team_name + ' was added to Firebase')
            res.sendFile(__dirname + '/public/success.html')
          }
        });
      }
    }
  });
});

// Slack Firesong
app.post('/slack/firesong', function(req, res) {
  genius.search('fire', function (error, results) {
    var dataJSON = JSON.parse(results);
    var hits = dataJSON.response.hits;

    // Get Random Genius Hit
    var i = (hits.length < 4 ? hits.length : 3);
    var random = Math.floor(Math.random() * i);

    // Get Genius song from random song id
    var geniusId = hits[random].result.id
    genius.getSong(geniusId, function (error, song) {
      if (error) {
        console.error('Get random Genius song error: ', error);
      } else {
        var songJSON = JSON.parse(song);

        // Find the Spotify Media
        var media = songJSON.response.song.media
        for (index in media) {
          if (media[index].provider == 'spotify') {
            var spotifyURL = media[index].url
            var spotifyId = spotifyURL.substr(37)

            // Send message to Slack
            var message = {
              'response_type': 'in_channel',
              'text': spotifyURL
            }
            res.send(message)

            // Record in Mixpanel
            recordMixpanelEvent(req, spotifyId)
            break
          }
        }
      }
    });
  });
});

function recordMixpanelEvent(req, spotify_id) {
  mixpanel.track('/firesong', {
    distinct_id: req.body.response_url.substr(33),
    user_id: req.body.user_id,
    user_name: req.body.user_name,
    channel_id: req.body.channel_id,
    team_id: req.body.team_id,
    team_domain: req.body.team_domain,
    text: req.body.text,
    song: spotify_id
  });
}

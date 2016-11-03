require ('newrelic');

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
var path = require('path');
var app = express()
var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.listen(process.env.PORT || 3000, function() {});

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/public/index.html')
})

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

app.post('/slack/firesong', function(req, res) {
  var Genius = require('node-genius')
  var genius = new Genius(process.env.GENIUS_ACCESS_TOKEN)
  genius.search(req.body.text, function (error, results) {
    var data = JSON.parse(results)
    var hits = data.response.hits
    getSpotifyTrack(hits, function(message, spotify_id) {
      res.send(message)

      var Mixpanel = require('mixpanel');
      var mixpanel = Mixpanel.init(process.env.MIXPANEL_KEY);
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
    })
  });
});

function randomGeniusHit(hits, callback) {
  var random = Math.floor(Math.random() * hits.length);
  var track = hits[random].result.title + ' ' + hits[random].result.primary_artist.name
  getSpotifyTrack(track, hits, function(message, spotify_id) {
    callback(message, spotify_id)
  })
}

function getSpotifyTrack(hits, callback) {
  var random = Math.floor(Math.random() * hits.length);
  var track = hits[random].result.title + ' ' + hits[random].result.primary_artist.name
  var url = 'https://api.spotify.com/v1/search?q=' + encodeURIComponent(track) + '&type=track'
  request(url, function (error, response, body) {
    if (error) {
      getSpotifyTrack(hits, callback)
    } else {
      var data = JSON.parse(body)
      if (data.tracks.items.length == 0) {
        getSpotifyTrack(hits, callback)
      } else {
        var song = {}
        song[data.tracks.items[0].id] = {
          artist: data.tracks.items[0].artists[0].name,
          external_url: data.tracks.items[0].external_urls.spotify,
          image_url: data.tracks.items[0].album.images[0].url,
          name: data.tracks.items[0].name,
          preview_url: data.tracks.items[0].preview_url,
          url: data.tracks.items[0].uri
        }
        callback({
          'response_type': 'in_channel',
          'text': data.tracks.items[0].external_urls.spotify
        }, data.tracks.items[0].uri)
      }
    }
  })
}

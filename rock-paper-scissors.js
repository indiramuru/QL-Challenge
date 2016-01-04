Rooms = new Mongo.Collection('rooms');

var EMPTYROOM = {
  player1: {
    last_action: 0,
    has_played: false,
    selected_option: false
  },
  player2: {
    last_action: 0,
    has_played: false,
    selected_option: false
  }
};

if (Meteor.isClient) {

  // default landing page
  Router.route('/', function() {
    this.subscribe('rooms').wait();

    this.render('start');

    // clear session alert text, if set
    setTimeout(Session.set.bind(Session, 'alert', false), 5000);

    // clear session heartbeat, if set
    clearInterval(Session.get('heartbeat'));
  });

  // find rooms with active player
  Template.start.helpers({
    alert: function() { return Session.get('alert'); },
    openrooms: function() {
      // only show rooms where one player is "active"
      var activeTimeout = 10000; // 10s
      return Rooms.find({$or: [
        {'player1.last_action': {$gt: Date.now() - activeTimeout}},
        {'player2.last_action': {$gt: Date.now() - activeTimeout}},
      ]});
    }
  });
  //Starting new game
  Template.start.events({
    'click button.new': function() {
      var room = Rooms.insert(EMPTYROOM);
	  console.log(room);
      Router.go('/' + room + '/player1');
    }
  });

  //Game room validation and rendering 'room' template
  Router.route('/:roomId/:player', function() {
    var roomId = this.params.roomId;
    var player = this.params.player;

    // ensure we have room loaded
    this.subscribe('rooms').wait();
    if (!this.ready()) return this.render('loading');

    // determine game room
    var room = Rooms.findOne(roomId, {reactive: false});
    if (!room) {
      Session.set('alert', 'Room not found.');
      return Router.go('/');
    }

    // determine "player1" or "player2"
    if (!player.match(/^player[12]$/)) {
      Session.set('alert', 'Invalid player type.');
      return Router.go('/');
    }

    // ensure player is filling a "vacant/disconnected" position
    if (room[player].last_action > Date.now() - 5000) {
      Session.set('alert', 'Cannot join as ' + player + '. Seat taken?');
      return Router.go('/');
    }

    // update player's activity indicator
    Session.set('heartbeat', setInterval(function() {
      var update = {$set: {}};
      update.$set[player + '.last_action'] = Date.now();
      Rooms.update(room._id, update);
    }, 1000)); // 1 sec

    // render display
    this.render('room', {
      data: function() { return {
        roomId: room._id,
        player: player
      }; }
    });
  });
  //Finding a room with specified ID
  Template.room.helpers({
    room: function(roomId) {
      return Rooms.findOne(roomId);
    }
  });
  //Event listener on selecting options
  Template.room.events({
    'click button': function(ev) {
      var move = ev.currentTarget.dataset.type;
      var data = Template.currentData();
      var updates = {$set: {}};
      updates.$set[data.player + '.has_played'] = true;
      updates.$set[data.player + '.selected_option'] = move;
      Rooms.update(data.roomId, updates);
    }
  });
}

if (Meteor.isServer) {
  Meteor.startup(function() {
	//Publishing collection in server to subscribe it in client
    Meteor.publish('rooms', function() {
      return Rooms.find({});
    });
    var victory = {
      'rock': 'scsr',
      'papr': 'rock',
      'scsr': 'papr',
    };
	//Triggered on changes to game room values
    Rooms.find({}).observe({
      changed: function(room) {
        var p1 = room.player1,
            p2 = room.player2;

        // ignore if waiting on other player
        if (!(p1.has_played && p2.has_played)) return;
		room.result = {};
        // Logic to find out the winner
        room.result = {
          player1: p1.selected_option,
          player2: p2.selected_option,
          winner: (p1.selected_option == p2.selected_option) ? 'tie' :
            ((victory[p1.selected_option] == p2.selected_option) ? 'player1' : 'player2')
        };

        // Resetting game state,
        p1.selected_option = p1.has_played = false;
        p2.selected_option = p2.has_played = false;

        Rooms.update(room._id, room);
      }
    });
  });
}

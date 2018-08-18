'use strict'

// HTML ELEMENTS
const localVideo = document.getElementById('local');
const remoteVideo = document.getElementById('remote');
const startButton = document.getElementById('start');
const hangupButton = document.getElementById('hangup');
const captions = document.getElementById('captions');
const canvas = document.getElementById('canvas');
const context = canvas.getContext('2d');
const displayRoomId = document.getElementById('room-id');

let localStream = null;
let remoteStream = null;
let isChannelReady = false;
let isInitiator = false;
let isStarted = false;
let pc = null;

// USER MEDIA CONSTRAINTS
const constraints = {
  video: true,
  audio: true
};

// SET UP AUDIO AND VIDO
const offerOptions = {
  offerToReceiveVideo: true,
  offerToReceiveAudio: true
};

const iceConfig = {
  'iceServers': [
    {
    'urls': 'stun:stun.l.google.com:19302'
    },
    {
      'urls': 'stun:stun01.sipphone.com'
    },
    {
      'urls': 'stun:stun.ekiga.net'
    }
  ]
};

// SET UP BUTTON AND CAPTIONS
hangupButton.disabled = true;
captions.style.display = "none";

//GENERATE RANDOM ROOM
let room = prompt('Enter room id or leave blank:');

////////////////////////////////////////////////////////////////////////////////

const socket = io.connect();

socket.on('created', (room) => {
  console.log('Created room ' + room);
  isInitiator = true;
});

if (room !== null) {
  socket.emit('create or join', room);
  console.log('Attempted to create or join room', room);
} else {
  room = `${Math.floor(Date.now() + Math.random())}`; // GENERATE RANDOM ID
  displayRoomId.innerText = `Your room id is = ${room}`;
  socket.emit('create or join', room);
  console.log('Attempted to create or join room', room);
}

socket.on('full', (room) => {
  console.log('Room ' + room + ' is full');
});

socket.on('join', (room) => {
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

socket.on('joined', (room) => {
  console.log('joined: ' + room);
  isChannelReady = true;
});

socket.on('log', (array) => {
  console.log.apply(console, array);
});

////////////////////////////////////////////////////////////////////////////////

const sendMessage = (message) => {
  console.log('Client sending message: ', message);
  socket.emit('message', message);
}

// This client receives a message
socket.on('message', (message) => {
  console.log('Client received message:', message);
  if (message === 'got user media') {
    maybeStart();
  } else if (message.type === 'offer') {
    if (!isInitiator && !isStarted) {
      maybeStart();
    }
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (message.type === 'answer' && isStarted) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === 'candidate' && isStarted) {
    let candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate
    });
    pc.addIceCandidate(candidate);
  } else if (message === 'bye' && isStarted) {
    handleRemoteHangup();
  }
});

////////////////////////////////////////////////////////////////////////////////

const start = () => {
  navigator.mediaDevices.getUserMedia(constraints) // create mediastream w/ video & audio
    .then((mediaStream) => {
      console.log("getting local user media");
      localStream = mediaStream;
      localVideo.srcObject = mediaStream; //srcObject -> can be MediaStream, MediaSource etc.
      startButton.disabled = true;
      sendMessage('got user media');
      if (isInitiator) {
        maybeStart();
      }
    })
    .catch(error => alert(error.message));
};

const maybeStart = () => {
  console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
  if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
    console.log('>>>>>> creating peer connection');
    createPeerConnection();
    pc.addStream(localStream);
    isStarted = true;
    console.log('isInitiator', isInitiator);
    if (isInitiator) {
      doCall();
    }
  }
};

window.onbeforeunload = () => {
  sendMessage('bye');
};

////////////////////////////////////////////////////////////////////////////////
// ICE AND PEER CONNECTION

const createPeerConnection = () => {
  try {
    pc = new RTCPeerConnection(null);
    pc.onicecandidate = handleIceCandidate;
    pc.onaddstream = handleRemoteStreamAdded;
    pc.onremovestream = handleRemoteStreamRemoved;
    console.log('Created RTCPeerConnnection');

    //ALLOW TO HANG UP
    hangupButton.disabled = false;
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
}

const handleIceCandidate = (event) => {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  } else {
    console.log('End of candidates.');
  }
}

const handleCreateOfferError = (event) => {
  console.log('createOffer() error: ', event);
}

const doCall = () => {
  console.log('Sending offer to peer');
  pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

const doAnswer = () => {
  console.log('Sending answer to peer.');
  pc.createAnswer().then(
    setLocalAndSendMessage,
    onCreateSessionDescriptionError
  );
}

const setLocalAndSendMessage = (sessionDescription) => {
  pc.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message', sessionDescription);
  sendMessage(sessionDescription);
}

const onCreateSessionDescriptionError = (error) => {
  trace('Failed to create session description: ' + error.toString());
}

const handleRemoteStreamAdded = (event) => {
  console.log('Remote stream added.');
  remoteStream = event.stream;
  remoteVideo.srcObject = remoteStream;
  captions.style.display = "block";
  updateCaptions();
}

const handleRemoteStreamRemoved = (event) => {
  console.log('Remote stream removed. Event: ', event);
}

const hangup = () => {
  console.log('Hanging up.');
  stop();
  sendMessage('bye');
}

const handleRemoteHangup = () => {
  console.log('Session terminated.');
  stop();
  isInitiator = false;
}

const stop = () => {
  isStarted = false;
  captions.style.display = "none";
  if (pc === null) {
    localVideo.srcObject = null;
  } else {
    pc.close();
    pc = null;
    remoteVideo.srcObject = null;
  }
}

////////////////////////////////////////////////////////////////////////////////
// Changed localVideo to remote, have not tested this yet
const setupCanvas = () => {
  canvas.width = remoteVideo.videoWidth;
  canvas.height = remoteVideo.videoHeight;
  context.font = '48px serif';
};

// UPDATE CAPTIONS EVERY 5 SECONDS
// TODO: update only when receive info from Google Stream API
const updateCaptions = () => {
  // updateCanvas();
  captions.innerText = Math.random();
  setTimeout(updateCaptions, 5000);
};

const updateCanvas = () => {
  context.drawImage(remoteVideo, 0, 0);
  context.fillText(Math.random(), 275, 425);
};

// BUTTONS
startButton.onclick = start;
hangupButton.onclick = hangup;



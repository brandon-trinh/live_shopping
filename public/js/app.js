mdc.ripple.MDCRipple.attachTo(document.querySelector('.mdc-button'));


const configuration = {
  iceServers: [
    {
      urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

let peerConnection = null;      //contains information of the peers
let localStream = null;         //contains audio, video stream of the local caller (eg : when client side, local is client and when in agent side, local is agent)
let remoteStream = null;        //contains audio, video stream of the other person (eg: when client side, remote is agent and vice-versa)
let screenSharing = false;      //boolean : true if there is a screenshare and false in not
let roomId = null;


//affect button to a function
function init() {
  document.querySelector('#cameraBtn').addEventListener('click', openUserMedia);
  document.querySelector('#hangupBtn').addEventListener('click', hangUp);
  document.querySelector('#createBtn').addEventListener('click', createRoom);
  document.querySelector('#shareBtn').addEventListener('click', startScreenShare);
  document.querySelector('#microphone').addEventListener('click', offMicro);
  document.querySelector('#video').addEventListener('click', offVideo);
}


async function createRoom() {
  document.querySelector('#createBtn').disabled = true;     //disable the button
  document.querySelector('#shareBtn').disabled = false;     //enable the button
  document.querySelector('#microphone').disabled = false;
  document.querySelector('#video').disabled = false;

  document.getElementById("microphone").id= "microphoneStop";   //switch the color of the button - see CSS
  document.getElementById("video").id= "videoStop";

  const db = firebase.firestore();
  const roomRef = await db.collection('rooms').doc();

  console.log('Create PeerConnection with configuration: ', configuration);
  peerConnection = new RTCPeerConnection(configuration);

  registerPeerConnectionListeners();

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Code for collecting ICE candidates below
  const callerCandidatesCollection = roomRef.collection('callerCandidates');

  
  peerConnection.addEventListener('icecandidate', event => {
    if (!event.candidate) {
      return;
    }
    console.log('Got candidate: ', event.candidate);
    callerCandidatesCollection.add(event.candidate.toJSON());
  });

  // Code for creating a room below
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  const roomWithOffer = {
    'offer': {
      type: offer.type,
      sdp: offer.sdp,
    },
    'RoomQty': 1,
  };
  await roomRef.set(roomWithOffer);
  roomId = roomRef.id;
  actualRoom=roomId;
  document.querySelector(
      '#currentRoom').innerText = `Current room is ${roomRef.id} - You are the caller!`;


  peerConnection.addEventListener('track', event => {
    console.log('Got remote track:', event.streams[0]);
    event.streams[0].getTracks().forEach(track => {
      console.log('Add a track to the remoteStream:', track);
      remoteStream.addTrack(track);
    });
  });

  // Listening for remote session description below
  roomRef.onSnapshot(async snapshot => {
    const data = snapshot.data();
    if (!peerConnection.currentRemoteDescription && data && data.answer) {
      const rtcSessionDescription = new RTCSessionDescription(data.answer);
      await peerConnection.setRemoteDescription(rtcSessionDescription);
    }
  });

  // Listen for remote ICE candidates below
  roomRef.collection('calleeCandidates').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async change => {
      if (change.type === 'added') {
        let data = change.doc.data();
        await peerConnection.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
}


//switch micro
const offMicro = function(){    //toggle state
  localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
  if (localStream.getAudioTracks()[0].enabled == true){
    document.getElementById("microphone").id= "microphoneStop";
  }
  else{
    document.getElementById("microphoneStop").id= "microphone";
  }
};

//switch camera
const offVideo = function(){    //toggle state
  localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled;
  if (localStream.getVideoTracks()[0].enabled == true){
    document.getElementById("video").id= "videoStop";
  }
  else{
    document.getElementById("videoStop").id= "video";
  }
};

//Enable video and microphone, set localStream and remoteStream
async function openUserMedia(e) {
  const stream = await navigator.mediaDevices.getUserMedia(
      {video: true, audio: true});
  document.querySelector('#localVideo').srcObject = stream;
  localStream = stream;
  remoteStream = new MediaStream();
  document.querySelector('#remoteVideo').srcObject = remoteStream;

  console.log('Stream:', document.querySelector('#localVideo').srcObject);
  document.querySelector('#cameraBtn').disabled = true;
  document.querySelector('#createBtn').disabled = false;
  document.querySelector('#hangupBtn').disabled = false;
}

//screenshare and switch button color
function startScreenShare() {
  if (screenSharing == true) {
      stopScreenSharing()
      document.getElementById("shareBtnStop").id= "shareBtn";
  }
  else{
    navigator.mediaDevices.getDisplayMedia({ video: true }).then((stream) => {
      screenStream = stream;
      let videoTrack = screenStream.getVideoTracks()[0];
      videoTrack.onended = () => {
          stopScreenSharing()
      }
      if (peerConnection) {
          let sender = peerConnection.getSenders().find(function (s) {
              return s.track.kind == videoTrack.kind;
          })
          sender.replaceTrack(videoTrack)
          screenSharing = true
          document.querySelector('#screenShare').srcObject = screenStream;
      }
      console.log(screenStream)
  })
  document.getElementById("shareBtn").id= "shareBtnStop";
  }
}

function stopScreenSharing() {
  if (!screenSharing) return;
  let videoTrack = localStream.getVideoTracks()[0];
  if (peerConnection) {
      let sender = peerConnection.getSenders().find(function (s) {
          return s.track.kind == videoTrack.kind;
      })
      sender.replaceTrack(videoTrack)
  }
  screenStream.getTracks().forEach(function (track) {
      track.stop();
  });
  screenSharing = false
}


//stop stream and connection
async function hangUp(e) {
  const tracks = document.querySelector('#localVideo').srcObject.getTracks();
  tracks.forEach(track => {
    track.stop();
  });

  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
  }

  if (peerConnection) {
    peerConnection.close();
  }

  
  try {
    document.querySelector('#shareBtn').disabled = true;
    document.querySelector('#microphone').disabled = true;
    document.querySelector('#video').disabled = true;
    document.querySelector('#shareBtnStop').disabled = true;
    document.querySelector('#microphoneStop').disabled = true;
    document.querySelector('#videoStop').disabled = true;
  } catch (error) {
    
  }

  document.querySelector('#localVideo').srcObject = null;
  document.querySelector('#remoteVideo').srcObject = null;
  document.querySelector('#screenShare').srcObject = null;
  document.querySelector('#cameraBtn').disabled = false;
  document.querySelector('#createBtn').disabled = true;
  document.querySelector('#hangupBtn').disabled = true;
  document.querySelector('#currentRoom').innerText = '';

  // Delete room on hangup
  if (roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection('rooms').doc(roomId);
    const calleeCandidates = await roomRef.collection('calleeCandidates').get();
    calleeCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    const callerCandidates = await roomRef.collection('callerCandidates').get();
    callerCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    await roomRef.delete();
  }

  document.location.reload(true);
}

function registerPeerConnectionListeners() {
  peerConnection.addEventListener('icegatheringstatechange', () => {
    console.log(
        `ICE gathering state changed: ${peerConnection.iceGatheringState}`);
  });

  peerConnection.addEventListener('connectionstatechange', async () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`);
    if(peerConnection.connectionState==='disconnected')
    {
      hangUp()
    }
  });

  peerConnection.addEventListener('signalingstatechange', () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`);
  });

  peerConnection.addEventListener('iceconnectionstatechange ', () => {
    console.log(
        `ICE connection state change: ${peerConnection.iceConnectionState}`);
  });
}

init();
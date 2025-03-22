// Global variables
const socket = io();
const meetingId = document.getElementById('meeting-id').innerText.split(':')[1].trim();
const userId = document.getElementById('user-id').value;
const username = document.getElementById('username').value;
let localStream = null;
let isGestureActive = false;
let isMicActive = true;
let isCameraActive = true;

// DOM elements
const videoGrid = document.getElementById('video-grid');
const chatMessages = document.getElementById('chat-messages');
const chatInputField = document.getElementById('chat-input-field');
const micToggle = document.getElementById('mic-toggle');
const cameraToggle = document.getElementById('camera-toggle');
const gestureToggle = document.getElementById('gesture-toggle');

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeMeeting();
    
    // Set up chat input
    chatInputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
});

// Initialize the meeting
async function initializeMeeting() {
    try {
        // Get media stream
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        // Create local video
        const localVideo = createVideoElement(userId, username, true);
        videoGrid.appendChild(localVideo);
        localVideo.srcObject = localStream;
        
        // Join the meeting
        socket.emit('join', { meeting_id: meetingId });
        
        // Set up socket event listeners
        setupSocketListeners();
        
        // Initialize gesture recognition if needed
        if (isGestureActive) {
            startGestureRecognition();
        }
    } catch (err) {
        console.error('Error accessing media devices:', err);
        addSystemMessage('Error: Could not access camera or microphone. Please check permissions.');
    }
}

// Set up socket event listeners
function setupSocketListeners() {
    // When a new user joins
    socket.on('user_joined', (data) => {
        addSystemMessage(`${data.username} joined the meeting`);
        
        // Send our video stream to the new user
        if (localStream) {
            // This would typically be handled by WebRTC, but for simplicity
            // we're just sending a notification here
        }
        
        // Update participants list
        updateParticipantsList(data.participants);
    });
    
    // When a user leaves
    socket.on('user_left', (data) => {
        addSystemMessage(`${data.username} left the meeting`);
        
        // Remove their video
        const userVideo = document.getElementById(`video-${data.user_id}`);
        if (userVideo) {
            userVideo.parentElement.remove();
        }
    });
    
    // When a new message is received
    socket.on('new_message', (data) => {
        addChatMessage(data.username, data.message, data.type);
        
        // If it's a gesture message, also convert to speech
        if (data.type === 'gesture') {
            speakText(data.message);
        }
    });
    
    // When receiving a video stream (this would be WebRTC in a real app)
    socket.on('video_stream', (data) => {
        // Handle incoming video stream
        // This would be WebRTC in a real implementation
    });
}

// Create a video element for a user
function createVideoElement(userId, username, isLocal = false) {
    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    videoContainer.id = `container-${userId}`;
    
    const video = document.createElement('video');
    video.id = `video-${userId}`;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = isLocal; // Mute local video to prevent feedback
    
    const nameTag = document.createElement('div');
    nameTag.className = 'name-tag';
    nameTag.textContent = username + (isLocal ? ' (You)' : '');
    
    videoContainer.appendChild(video);
    videoContainer.appendChild(nameTag);
    
    return video;
}

// Toggle microphone
function toggleMic() {
    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            isMicActive = !isMicActive;
            audioTracks[0].enabled = isMicActive;
            
            // Update UI
            micToggle.classList.toggle('active', isMicActive);
            micToggle.classList.toggle('inactive', !isMicActive);
            
            // Update icon
            const icon = micToggle.querySelector('.icon');
            icon.textContent = isMicActive ? '🎤' : '🔇';
        }
    }
}

// Toggle camera
function toggleCamera() {
    if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        if (videoTracks.length > 0) {
            isCameraActive = !isCameraActive;
            videoTracks[0].enabled = isCameraActive;
            
            // Update UI
            cameraToggle.classList.toggle('active', isCameraActive);
            cameraToggle.classList.toggle('inactive', !isCameraActive);
            
            // Update icon
            const icon = cameraToggle.querySelector('.icon');
            icon.textContent = isCameraActive ? '📹' : '🚫';
        }
    }
}

// Toggle gesture recognition
function toggleGesture() {
    isGestureActive = !isGestureActive;
    
    // Update UI
    gestureToggle.classList.toggle('active', isGestureActive);
    gestureToggle.classList.toggle('inactive', !isGestureActive);
    
    // Start or stop gesture recognition
    if (isGestureActive) {
        startGestureRecognition();
        addSystemMessage('Gesture recognition activated');
    } else {
        stopGestureRecognition();
        addSystemMessage('Gesture recognition deactivated');
    }
}

// Start gesture recognition
let gestureInterval = null;
function startGestureRecognition() {
    if (!localStream) return;
    
    // Create a canvas to capture frames from video
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const video = document.getElementById(`video-${userId}`);
    
    canvas.width = 320;
    canvas.height = 240;
    
    // Capture frames at regular intervals
    gestureInterval = setInterval(() => {
        if (!isGestureActive) {
            clearInterval(gestureInterval);
            return;
        }
        
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameData = canvas.toDataURL('image/jpeg');
        
        // Send frame to server for processing
        fetch('/process_gesture', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                frame: frameData,
                meeting_id: meetingId
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.gesture && data.gesture !== "Collecting frames..." && data.confidence > 0.7) {
                // Send recognized gesture as message
                socket.emit('gesture_message', {
                    meeting_id: meetingId,
                    message: data.gesture
                });
            }
        })
        .catch(error => {
            console.error('Error processing gesture:', error);
        });
    }, 1000); // Process every second
}

// Stop gesture recognition
function stopGestureRecognition() {
    if (gestureInterval) {
        clearInterval(gestureInterval);
        gestureInterval = null;
    }
}

// Send a chat message
function sendChatMessage() {
    const message = chatInputField.value.trim();
    if (message) {
        socket.emit('chat_message', {
            meeting_id: meetingId,
            message: message
        });
        
        chatInputField.value = '';
    }
}

// Add a chat message to the chat box
function addChatMessage(sender, message, type = 'chat') {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}-message`;
    
    const senderElement = document.createElement('div');
    senderElement.className = 'message-sender';
    senderElement.textContent = sender;
    
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    contentElement.textContent = message;
    
    messageElement.appendChild(senderElement);
    messageElement.appendChild(contentElement);
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Add a system message to the chat box
function addSystemMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'system-message';
    
    const contentElement = document.createElement('p');
    contentElement.textContent = message;
    
    messageElement.appendChild(contentElement);
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Speak text using text-to-speech
function speakText(text) {
    if ('speechSynthesis' in window) {
        const speech = new SpeechSynthesisUtterance(text);
        speech.lang = 'en-US';
        window.speechSynthesis.speak(speech);
    }
}

// Copy meeting ID to clipboard
function copyMeetingId() {
    const meetingId = document.getElementById('meeting-id').innerText.split(':')[1].trim();
    navigator.clipboard.writeText(meetingId)
        .then(() => {
            alert('Meeting ID copied to clipboard');
        })
        .catch(err => {
            console.error('Could not copy text:', err);
        });
}

// Leave the meeting
function leaveMeeting() {
    socket.emit('leave', { meeting_id: meetingId });
    
    // Stop all media tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    // Stop gesture recognition if active
    if (isGestureActive) {
        stopGestureRecognition();
    }
    
    // Redirect to thank you page
    window.location.href = `/thankyou?meeting_id=${meetingId}`;
}

// Update the list of participants
function updateParticipantsList(participants) {
    // This function would update a UI component showing all participants
    console.log('Participants:', participants);
}

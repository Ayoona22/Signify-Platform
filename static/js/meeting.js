// Global variables
const socket = io();
const meetingId = document.querySelector('.meeting-id span').textContent.split(': ')[1];
const userId = document.getElementById('video-grid').dataset.userId;
const username = document.getElementById('video-grid').dataset.username;

let localStream = null;
let peers = {};
let isAudioEnabled = true;
let isVideoEnabled = true;
let isGestureEnabled = false;
let gestureRecognitionInterval = null;
let recognitionInProgress = false;

// DOM elements
const videoGrid = document.getElementById('video-grid');
const chatMessages = document.getElementById('chat-messages');
const chatInputField = document.getElementById('chat-input-field');
const micToggle = document.getElementById('mic-toggle');
const cameraToggle = document.getElementById('camera-toggle');
const gestureToggle = document.getElementById('gesture-toggle');

// Initialize the meeting
document.addEventListener('DOMContentLoaded', () => {
    initializeMeeting();
    
    // Enter key to send chat messages
    chatInputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
    
    // Join the meeting room
    socket.emit('join', { meeting_id: meetingId });
});

// Leave the meeting and redirect to thank you page
function leaveMeeting() {
    socket.emit('leave', { meeting_id: meetingId });
    
    // Stop all streams and connections
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    // Close peer connections
    for (let peerId in peers) {
        peers[peerId].close();
    }
    
    // Redirect to thank you page
    window.location.href = `/thankyou?meeting_id=${meetingId}`;
}

// Copy meeting ID to clipboard
function copyMeetingId() {
    navigator.clipboard.writeText(meetingId).then(() => {
        alert('Meeting ID copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy meeting ID: ', err);
    });
}

// Initialize the meeting with video and audio
async function initializeMeeting() {
    try {
        // Get user media
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        // Create and display local video
        const localVideo = createVideoElement(userId, username, true);
        localVideo.srcObject = localStream;
        videoGrid.appendChild(localVideo);
        
        // Set up socket event listeners
        setupSocketListeners();
        
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Failed to access camera and microphone. Please check permissions.');
    }
}

// Create a video element for a participant
function createVideoElement(id, name, isLocal = false) {
    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    videoContainer.id = `video-container-${id}`;
    
    const video = document.createElement('video');
    video.id = `video-${id}`;
    video.autoplay = true;
    video.playsInline = true;
    
    if (isLocal) {
        video.muted = true; // Mute local video to prevent feedback
    }
    
    const nameLabel = document.createElement('div');
    nameLabel.className = 'name-label';
    nameLabel.textContent = name + (isLocal ? ' (You)' : '');
    
    videoContainer.appendChild(video);
    videoContainer.appendChild(nameLabel);
    
    return videoContainer;
}

// Set up socket event listeners
function setupSocketListeners() {
    // When a new user joins
    socket.on('user_joined', (data) => {
        // Add system message
        addSystemMessage(`${data.username} joined the meeting.`);
        
        // If user is not yourself, create a video element for them
        if (data.user_id !== userId) {
            // Share your stream with the new user
            sendVideoStream(data.user_id);
        }
    });
    
    // When a user leaves
    socket.on('user_left', (data) => {
        // Add system message
        addSystemMessage(`${data.username} left the meeting.`);
        
        // Remove their video
        const videoContainer = document.getElementById(`video-container-${data.user_id}`);
        if (videoContainer) {
            videoContainer.remove();
        }
    });
    
    // When receiving a chat or gesture message
    socket.on('new_message', (data) => {
        addChatMessage(data);
    });
    
    // When receiving a video stream from another user
    socket.on('video_stream', (data) => {
        if (data.user_id !== userId) {
            // Create video element if it doesn't exist
            let videoContainer = document.getElementById(`video-container-${data.user_id}`);
            if (!videoContainer) {
                videoContainer = createVideoElement(data.user_id, data.username);
                videoGrid.appendChild(videoContainer);
            }
            
            // Update the video stream
            const video = document.getElementById(`video-${data.user_id}`);
            if (video && data.stream) {
                const mediaStream = new MediaStream();
                mediaStream.addTrack(data.stream);
                video.srcObject = mediaStream;
            }
        }
    });
}

// Send chat message
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
function addChatMessage(data) {
    const messageElement = document.createElement('div');
    
    if (data.type === 'gesture') {
        messageElement.className = 'gesture-message';
        messageElement.innerHTML = `
            <span class="sender">${data.username} (via gesture):</span>
            <p>${data.message}</p>
        `;
    } else {
        messageElement.className = 'chat-message';
        messageElement.innerHTML = `
            <span class="sender">${data.username}:</span>
            <p>${data.message}</p>
        `;
    }
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Add a system message to the chat box
function addSystemMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'system-message';
    messageElement.innerHTML = `<p>${message}</p>`;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Toggle microphone
function toggleMic() {
    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            isAudioEnabled = !isAudioEnabled;
            audioTracks[0].enabled = isAudioEnabled;
            
            // Update button UI
            micToggle.classList.toggle('disabled', !isAudioEnabled);
            const icon = micToggle.querySelector('.icon');
            icon.textContent = isAudioEnabled ? '🎤' : '🔇';
        }
    }
}

// Toggle camera
function toggleCamera() {
    if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        if (videoTracks.length > 0) {
            isVideoEnabled = !isVideoEnabled;
            videoTracks[0].enabled = isVideoEnabled;
            
            // Update button UI
            cameraToggle.classList.toggle('disabled', !isVideoEnabled);
            const icon = cameraToggle.querySelector('.icon');
            icon.textContent = isVideoEnabled ? '📹' : '🚫';
        }
    }
}

// Toggle gesture recognition
function toggleGesture() {
    isGestureEnabled = !isGestureEnabled;
    
    // Update button UI
    gestureToggle.classList.toggle('active', isGestureEnabled);
    
    if (isGestureEnabled) {
        // Start gesture recognition
        startGestureRecognition();
        addSystemMessage("Gesture recognition is now ON.");
    } else {
        // Stop gesture recognition
        stopGestureRecognition();
        addSystemMessage("Gesture recognition is now OFF.");
    }
}

// Start gesture recognition
function startGestureRecognition() {
    if (!gestureRecognitionInterval) {
        gestureRecognitionInterval = setInterval(() => {
            if (!recognitionInProgress && isGestureEnabled && isVideoEnabled) {
                captureFrameAndRecognize();
            }
        }, 1000); // Check every second
    }
}

// Stop gesture recognition
function stopGestureRecognition() {
    if (gestureRecognitionInterval) {
        clearInterval(gestureRecognitionInterval);
        gestureRecognitionInterval = null;
    }
}

// Capture video frame and send for recognition
function captureFrameAndRecognize() {
    if (!localStream || !isVideoEnabled) return;
    
    recognitionInProgress = true;
    
    try {
        const video = document.getElementById(`video-${userId}`);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw the current video frame on the canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert canvas to base64 image
        const frameData = canvas.toDataURL('image/jpeg', 0.8);
        
        // Send frame data for gesture recognition
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
                // Send recognized gesture as a message
                socket.emit('gesture_message', {
                    meeting_id: meetingId,
                    message: data.gesture
                });
                
                // Speak the gesture using text-to-speech
                speakGesture(data.gesture);
            }
            recognitionInProgress = false;
        })
        .catch(error => {
            console.error('Error processing gesture:', error);
            recognitionInProgress = false;
        });
    } catch (error) {
        console.error('Error capturing frame:', error);
        recognitionInProgress = false;
    }
}

// Speak the recognized gesture using text-to-speech
function speakGesture(text) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utterance);
    }
}

// Send video stream to other participants
function sendVideoStream(targetUserId) {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            socket.emit('video_stream', {
                meeting_id: meetingId,
                target_user_id: targetUserId,
                stream: videoTrack
            });
        }
    }
}

// Toggle participants panel
function toggleParticipantsPanel() {
    const panel = document.querySelector('.participants-panel');
    if (panel) {
        panel.classList.toggle('active');
    }
}

// Toggle chat panel on mobile
function toggleChatPanel() {
    const chatContainer = document.querySelector('.chat-container');
    if (chatContainer) {
        chatContainer.classList.toggle('active');
    }
}

// Window beforeunload event to leave meeting gracefully
window.addEventListener('beforeunload', () => {
    socket.emit('leave', { meeting_id: meetingId });
});
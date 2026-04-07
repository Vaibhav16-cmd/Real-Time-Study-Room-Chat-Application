const API = "http://localhost:5000";

// ================= GLOBAL =================
let token = localStorage.getItem("token");
let socket;
let localStream;
let peers = {};

// ================= REGISTER =================
async function register(){
const name = document.getElementById("name")?.value;
const email = document.getElementById("email")?.value;
const password = document.getElementById("password")?.value;

if(!name || !email || !password){
  document.getElementById("msg").innerText = "All fields required";
  return;
}

const res = await fetch(API + "/api/auth/register",{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({name,email,password})
});

const data = await res.json();
document.getElementById("msg").innerText = data.message || "Registered";

setTimeout(()=> window.location.href="login.html",1000);
}

// ================= LOGIN =================
async function login(){
const email = document.getElementById("email")?.value;
const password = document.getElementById("password")?.value;

if(!email || !password){
  document.getElementById("msg").innerText = "All fields required";
  return;
}

const res = await fetch(API + "/api/auth/login",{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({email,password})
});

const data = await res.json();

if(data.token){
localStorage.setItem("token",data.token);
localStorage.setItem("userId",data.id);
localStorage.setItem("userName",data.name);
window.location.href="rooms.html";
}else{
document.getElementById("msg").innerText = data.message || "Login failed";
}
}

// ================= LOGOUT =================
function logout(){
localStorage.clear();
window.location.href="login.html";
}

// ================= ROOMS =================
async function createRoom(){
const name = document.getElementById("roomName")?.value;
if(!name) return alert("Enter room name");

const res = await fetch(API + "/api/rooms",{
method:"POST",
headers:{
"Content-Type":"application/json",
"Authorization":"Bearer " + token
},
body:JSON.stringify({name})
});

const room = await res.json();

if(!room._id){
  alert("Error creating room");
  return;
}

localStorage.setItem("roomId", room._id);
window.location.href="chat.html";
}

async function loadRooms(){
const res = await fetch(API + "/api/rooms",{
headers:{ "Authorization":"Bearer " + token }
});

const rooms = await res.json();
const list = document.getElementById("rooms");
if(!list) return;

list.innerHTML="";

rooms.forEach(room=>{
const div = document.createElement("div");
div.className = "room-card";

div.innerHTML = `
<span>${room.name}</span>
<button onclick="joinRoom('${room._id}')">Join</button>
`;

list.appendChild(div);
});
}

async function joinRoom(roomId){
if(!roomId) return alert("Invalid room");

await fetch(API + "/api/rooms/" + roomId + "/join",{
method:"POST",
headers:{ "Authorization":"Bearer " + token }
});

localStorage.setItem("roomId",roomId);
window.location.href="chat.html";
}

// ================= CHAT PAGE INIT =================
if(window.location.pathname.includes("chat.html")){

const roomId = localStorage.getItem("roomId");

if(!roomId){
  alert("Room not selected!");
  window.location.href="rooms.html";
}

// FIX SOCKET
socket = io("http://localhost:5000");

startVideo(roomId);
loadMessages();
}

// ================= VIDEO =================
async function startVideo(roomId){

try{
localStream = await navigator.mediaDevices.getUserMedia({
video:true,
audio:true
});
}catch(e){
alert("Camera permission denied");
return;
}

document.getElementById("localVideo").srcObject = localStream;

socket.emit("joinRoom", roomId);

// NEW USER
socket.on("user-connected", userId=>{
createPeer(userId);
});

// OFFER
socket.on("offer", async ({offer, from})=>{
const peer = createPeer(from);

await peer.setRemoteDescription(offer);

const answer = await peer.createAnswer();
await peer.setLocalDescription(answer);

socket.emit("answer", {answer, to: from});
});

// ANSWER
socket.on("answer", async ({answer, from})=>{
if(peers[from]){
await peers[from].setRemoteDescription(answer);
}
});

// ICE
socket.on("ice-candidate", ({candidate, from})=>{
if(peers[from]){
peers[from].addIceCandidate(candidate);
}
});

// DISCONNECT
socket.on("user-disconnected", userId=>{
if(peers[userId]){
peers[userId].close();
delete peers[userId];
}
const video = document.getElementById("video-" + userId);
if(video) video.remove();
});

// RECEIVE MESSAGE
socket.on("receiveMessage", msg=>{
addMessage(msg);
});

// TYPING
socket.on("typing", ()=>{
const typingDiv = document.getElementById("typing");
if(typingDiv){
typingDiv.innerText = "Someone is typing...";
setTimeout(()=> typingDiv.innerText = "",1000);
}
});
}

// ================= PEER =================
function createPeer(userId){

if(peers[userId]) return peers[userId];

const peer = new RTCPeerConnection();
peers[userId] = peer;

localStream.getTracks().forEach(track=>{
peer.addTrack(track, localStream);
});

peer.ontrack = (event)=>{
if(document.getElementById("video-" + userId)) return;

const video = document.createElement("video");
video.id = "video-" + userId;
video.srcObject = event.streams[0];
video.autoplay = true;
video.playsInline = true;

document.getElementById("videoGrid").appendChild(video);
};

peer.onicecandidate = (event)=>{
if(event.candidate){
socket.emit("ice-candidate", {
candidate: event.candidate,
to: userId
});
}
};

peer.createOffer().then(offer=>{
peer.setLocalDescription(offer);

socket.emit("offer", {
offer,
to: userId
});
});

return peer;
}

// ================= CHAT =================
async function loadMessages(){

const roomId = localStorage.getItem("roomId");

if(!roomId){
console.error("RoomId missing");
return;
}

const res = await fetch(API + "/api/messages/" + roomId,{
headers:{ "Authorization":"Bearer " + token }
});

const data = await res.json();

if(!Array.isArray(data)){
console.error("Messages error:", data);
return;
}

data.forEach(m=>addMessage(m));
}

function sendMessage(){

const input = document.getElementById("msgInput");
if(!input || !input.value.trim()) return;

socket.emit("sendMessage",{
roomId: localStorage.getItem("roomId"),
senderId: localStorage.getItem("userId"),
message: input.value
});

input.value="";
}

// ADD MESSAGE
function addMessage(msg){

if(!msg || !msg.sender) return;

const div = document.createElement("div");
div.className = "message";

if(msg.sender._id === localStorage.getItem("userId")){
div.classList.add("me");
}

div.innerText = msg.sender.name + ": " + msg.content;

const container = document.getElementById("messages");

if(container){
container.appendChild(div);
container.scrollTop = container.scrollHeight;
}
}

// ================= TYPING =================
document.addEventListener("input", (e)=>{
if(e.target.id === "msgInput" && socket){
socket.emit("typing", localStorage.getItem("roomId"));
}
});

// ================= CONTROLS =================
function toggleMute(){
if(localStream){
localStream.getAudioTracks()[0].enabled =
!localStream.getAudioTracks()[0].enabled;
}
}

function toggleCamera(){
if(localStream){
localStream.getVideoTracks()[0].enabled =
!localStream.getVideoTracks()[0].enabled;
}
}

function leaveRoom(){
window.location.href="rooms.html";
}
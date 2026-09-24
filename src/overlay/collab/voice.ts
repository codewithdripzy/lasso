import { state } from "../state";
import { getDOM } from "../dom";
import { collabEmit } from "./socket";
import { showActivity } from "./presence";
import { getAudioMediaStream } from "../audio/transcribe";

export function updateVoiceBar() {
  const dom = getDOM();
  const voiceBar = dom.shadow.querySelector<HTMLDivElement>(".lasso-voice-bar");
  const voiceBtn = dom.shadow.querySelector<HTMLButtonElement>(".voice-tool");
  if (!voiceBar || !voiceBtn) return;

  voiceBar.classList.toggle("visible", state.voiceOn);

  const muteBtn = voiceBar.querySelector<HTMLButtonElement>(".mute-toggle");
  if (muteBtn) {
    muteBtn.classList.toggle("muted", state.voiceMuted);
    muteBtn.title = state.voiceMuted ? "Unmute" : "Mute";
    muteBtn.innerHTML = state.voiceMuted
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <line x1="2" y1="2" x2="22" y2="22"/>
          <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/>
          <path d="M5 10v2a7 7 0 0 0 12 5"/>
          <line x1="12" y1="19" x2="12" y2="22"/>
          <line x1="8" y1="22" x2="16" y2="22"/>
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/>
        </svg>`
      : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3"/>
          <path d="M5 10v2a7 7 0 0 0 14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="22"/>
          <line x1="8" y1="22" x2="16" y2="22"/>
        </svg>`;
  }

  voiceBtn.classList.toggle("live", state.voiceOn && !state.voiceMuted);
  voiceBtn.classList.toggle("muted", state.voiceOn && state.voiceMuted);
}

export async function toggleVoice() {
  if (!state.collabJoined || !state.collabProjectId) {
    showActivity("Join the realtime session first — start Lasso and log in to collaborate.", "#fdd663");
    return;
  }

  if (state.voiceOn) {
    leaveVoice();
    return;
  }

  // Pre-check: Clipboard/mic APIs require a secure context
  if (typeof window !== "undefined" && !window.isSecureContext) {
    showActivity("Voice requires HTTPS or localhost — please open the app via http://localhost or https://.", "#f28b82");
    return;
  }

  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    showActivity("Microphone access is not available in this browser or context.", "#f28b82");
    return;
  }

  try {
    state.myLocalStream = await getAudioMediaStream();
  } catch (err: any) {
    showActivity(err?.message || "Microphone access was denied.", "#f28b82");
    return;
  }

  collabEmit("voice:join", { sessionId: state.collabProjectId }, (res) => {
    if (!res.ok) {
      stopLocalTracks();
      showActivity(res.error || "Could not join the voice room.", "#f28b82");
      return;
    }
    state.voiceOn = true;
    updateVoiceBar();
    const peers = (res.peers || []) as Array<{ socketId: string }>;
    for (const peer of peers) ensurePeer(peer.socketId, true);
    showActivity(`Voice connected — ${state.myUser?.name || "you"} are in the room.`, "#81c995");
  });
}

export function leaveVoice() {
  if (state.collabProjectId) {
    collabEmit("voice:leave", { sessionId: state.collabProjectId });
  }
  closeAllPeers();
  stopLocalTracks();
  state.voiceOn = false;
  updateVoiceBar();
}

export function setVoiceMuted(muted: boolean) {
  state.voiceMuted = muted;
  if (state.myLocalStream) {
    state.myLocalStream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }
  updateVoiceBar();
  if (state.collabSocket?.connected && state.collabProjectId) {
    collabEmit("voice:mute", { sessionId: state.collabProjectId, muted });
  }
}

export function ensurePeer(socketId: string, initiator: boolean) {
  if (state.rtcPeers.has(socketId) || socketId === state.collabSocket?.id) return;
  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  const entry: { pc: RTCPeerConnection; audio?: HTMLAudioElement } = { pc };
  state.rtcPeers.set(socketId, entry);

  state.myLocalStream?.getTracks().forEach((track) => pc.addTrack(track, state.myLocalStream!));

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      collabEmit("voice:candidate", { to: socketId, candidate: event.candidate.toJSON() });
    }
  };

  pc.ontrack = (event) => {
    if (entry.audio) return;
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.srcObject = event.streams[0];
    document.body.appendChild(audio);
    entry.audio = audio;
  };

  pc.onconnectionstatechange = () => {
    if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
      closePeer(socketId);
    }
  };

  if (initiator && state.myLocalStream) {
    pc.createOffer()
      .then((offer) => {
        pc.setLocalDescription(offer);
        collabEmit("voice:offer", { to: socketId, description: offer });
      })
      .catch(() => closePeer(socketId));
  }
}

export function handleOffer(payload: { from?: string; description?: unknown }) {
  const from = payload.from;
  if (!from || !payload.description) return;
  ensurePeer(from, false);
  const entry = state.rtcPeers.get(from);
  if (!entry) return;

  entry.pc
    .setRemoteDescription(payload.description as RTCSessionDescriptionInit)
    .then(() => entry.pc.createAnswer())
    .then((answer) => {
      entry.pc.setLocalDescription(answer);
      collabEmit("voice:answer", { to: from, description: answer });
    })
    .catch(() => closePeer(from));
  flushCandidates(from);
}

export function handleAnswer(payload: { from?: string; description?: unknown }) {
  const from = payload.from;
  if (!from) return;
  const entry = state.rtcPeers.get(from);
  if (!entry || !payload.description) return;
  entry.pc.setRemoteDescription(payload.description as RTCSessionDescriptionInit).catch(() => closePeer(from));
  flushCandidates(from);
}

export function handleCandidate(payload: { from?: string; candidate?: unknown }) {
  const from = payload.from;
  if (!from || !payload.candidate) return;
  const entry = state.rtcPeers.get(from);
  if (!entry) return;

  if (entry.pc.remoteDescription) {
    entry.pc.addIceCandidate(payload.candidate as RTCIceCandidateInit).catch(() => {});
  } else {
    const pending = state.rtcPendingCandidates.get(from) || [];
    pending.push(payload.candidate as RTCIceCandidateInit);
    state.rtcPendingCandidates.set(from, pending);
  }
}

export function flushCandidates(socketId: string) {
  const pending = state.rtcPendingCandidates.get(socketId);
  if (!pending) return;
  state.rtcPendingCandidates.delete(socketId);
  const entry = state.rtcPeers.get(socketId);
  if (!entry) return;
  for (const candidate of pending) entry.pc.addIceCandidate(candidate).catch(() => {});
}

export function closePeer(socketId: string) {
  const entry = state.rtcPeers.get(socketId);
  if (!entry) return;
  state.rtcPeers.delete(socketId);
  state.rtcPendingCandidates.delete(socketId);
  entry.audio?.remove();
  try {
    entry.pc.close();
  } catch {
    // already closed
  }
}

export function closeAllPeers() {
  for (const socketId of [...state.rtcPeers.keys()]) closePeer(socketId);
}

export function stopLocalTracks() {
  state.myLocalStream?.getTracks().forEach((track) => track.stop());
  state.myLocalStream = null;
}

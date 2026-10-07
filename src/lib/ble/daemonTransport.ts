import type { Transport, GroupInfo, DiscoveredGroup, ScanSession, FrameListener, PeerListener, Unsubscribe, PeerId, PeerEvent } from "./transport";
import type { Frame } from "./frames";

/**
 * DaemonTransport bridges the btchat UI to the native AirDrop-X Python daemon via WebSockets.
 * This completely replaces the WebBluetooth constraints and aligns the UI with the project's
 * true capabilities: Wi-Fi Direct file transfers, X25519 Encryption, and Native BLE Mesh.
 */
export class DaemonTransport implements Transport {
  readonly kind = "native";
  readonly capabilities = { canHost: true, canJoin: true, listsGroups: true };

  private ws: WebSocket | null = null;
  private peerId: string = "local";
  private peers: Set<string> = new Set();
  
  private frameListeners: Set<FrameListener> = new Set();
  private peerListeners: Set<PeerListener> = new Set();
  
  private groupInfo: GroupInfo = {
    groupId: "airdrop-x-mesh",
    groupName: "AirDrop-X Secure Mesh",
    memberCount: 1
  };

  private async fetchToken(): Promise<string> {
    const envToken = process.env.NEXT_PUBLIC_WS_TOKEN;
    if (envToken) return envToken;
    throw new Error("No token found. Ensure airdrop-daemon.py is running before starting the UI.");
  }

  private async ensureWS(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    
    const token = await this.fetchToken();
    
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://127.0.0.1:8765?token=${token}`);
      
      this.ws.onopen = () => {
         console.log("Connected to AirDrop-X Native Daemon");
         resolve();
      };
      
      this.ws.onerror = (e) => reject(new Error("Ensure airdrop-daemon.py is running on port 8765."));
      
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === "STATUS_UPDATE" || data.type === "IDENTITY") {
          this.peerId = data.peer_id;
        } else if (data.type === "PEER_DISCOVERED") {
          if (!this.peers.has(data.peer_id)) {
             this.peers.add(data.peer_id);
             this.groupInfo.memberCount = this.peers.size + 1;
             this.emitPeerEvent({ type: "connected", peerId: data.peer_id });
          }
        } else if (data.type === "PEER_DISCONNECTED") {
          if (this.peers.has(data.peer_id)) {
             this.peers.delete(data.peer_id);
             this.groupInfo.memberCount = this.peers.size + 1;
             this.emitPeerEvent({ type: "disconnected", peerId: data.peer_id });
          }
        } else if (data.type === "MESSAGE_RECEIVED") {
           try {
             // Parse the payload as a JSON frame
             const parsed = JSON.parse(data.payload);
             
             if (!parsed || typeof parsed !== 'object' || !parsed.type) {
               console.warn("Invalid frame payload received:", data.payload);
               return;
             }

             // Basic runtime schema validation based on frame type
             const frameType = parsed.type;
             if (!["JOIN", "JOIN_ACK", "LEAVE", "MEMBER_LIST", "TEXT", "FILE_OFFER", "FILE_CHUNK", "FILE_DONE", "CLOSE"].includes(frameType)) {
               console.warn("Unknown frame type received:", frameType);
               return;
             }
             
             const frame = parsed as Frame;
             
             // To prevent impersonation, force the senderId to be the actual peer ID that sent the message.
             // If it's a TEXT frame, we force it here.
             if (frame.type === "TEXT") {
                 frame.senderId = data.peer || "unknown";
             }
             this.frameListeners.forEach(l => l(frame, data.peer));
           } catch (e) {
             console.warn("Failed to parse JSON frame payload:", data.payload, e);
           }
        } else if (data.type === "FILE_INCOMING") {
           const frame: Frame = { 
             type: "FILE_OFFER", 
             fileId: data.file_name, 
             name: data.file_name, 
             size: data.size, 
             mimeType: "application/octet-stream", 
             sha256: "",
             senderId: data.peer || "unknown",
             senderName: data.peer ? data.peer.substring(0, 6) : "Peer"
           };
           this.frameListeners.forEach(l => l(frame, data.peer || "Host"));
        } else if (data.type === "FILE_RECEIVED") {
           const frame: Frame = { type: "FILE_DONE", fileId: data.file_name, status: "complete" };
           this.frameListeners.forEach(l => l(frame, data.peer || "Host"));
        }
      };
    });
  }

  async startAdvertising(group: GroupInfo): Promise<void> {
    await this.ensureWS();
    this.groupInfo = group;
  }
  
  async updateGroupInfo(group: GroupInfo): Promise<void> {
    this.groupInfo = group;
  }
  
  async stopAdvertising(): Promise<void> {}

  async scan(onFound: (group: DiscoveredGroup) => void): Promise<ScanSession> {
    await this.ensureWS();
    // Ask daemon to broadcast handshake to discover peers actively
    this.ws?.send(JSON.stringify({ type: "BROADCAST_HANDSHAKE" }));
    
    // Simulate finding the global mesh group
    onFound({
      groupId: "airdrop-x-mesh",
      groupName: "AirDrop-X Secure Mesh",
      rssi: -40
    });
    
    return { stop: () => {} };
  }
  
  async connect(groupId: string): Promise<GroupInfo> {
    await this.ensureWS();
    return this.groupInfo;
  }

  async send(frame: Frame, to?: PeerId[]): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Daemon WebSocket is not connected.");
    }
    
    const payload = JSON.stringify(frame);
    const targets = to && to.length > 0 ? to : (this.peers.size > 0 ? Array.from(this.peers) : ["ffffffffffff"]);
    
    for (const target of targets) {
       this.ws.send(JSON.stringify({
          type: "SEND_MESSAGE",
          target_peer: target,
          payload: payload
       }));
    }
  }

  async sendFile(file: File, to?: PeerId[]): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Daemon WebSocket is not connected.");
    }
    
    // Stage file chunks
    const CHUNK_SIZE = 1024 * 512; // 512KB chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    for (let i = 0; i < totalChunks; i++) {
      const blob = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const arrayBuffer = await blob.arrayBuffer();
      // base64 encode for browser
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let j = 0; j < uint8.byteLength; j++) {
        binary += String.fromCharCode(uint8[j]);
      }
      const base64 = btoa(binary);
      
      this.ws.send(JSON.stringify({
         type: "STAGE_FILE_CHUNK",
         file_name: file.name,
         chunk: base64,
         chunk_index: i,
         total_chunks: totalChunks
      }));
      // wait a bit for daemon to process
      await new Promise(r => setTimeout(r, 50));
    }
    
    const targets = to && to.length > 0 ? to : (this.peers.size > 0 ? Array.from(this.peers) : ["ffffffffffff"]);
    
    for (const target of targets) {
       this.ws.send(JSON.stringify({
          type: "SEND_FILE",
          target_peer: target,
          file_name: file.name
       }));
    }
  }

  onFrame(callback: FrameListener): Unsubscribe {
    this.frameListeners.add(callback);
    return () => { this.frameListeners.delete(callback); };
  }
  
  onPeerEvent(callback: PeerListener): Unsubscribe {
    this.peerListeners.add(callback);
    return () => { this.peerListeners.delete(callback); };
  }

  private emitPeerEvent(event: PeerEvent) {
    this.peerListeners.forEach(l => l(event));
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.peers.clear();
  }
}

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

  private async ensureWS(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket("ws://127.0.0.1:8765?token=airdrop_dev_token");
      
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
        } else if (data.type === "MESSAGE_RECEIVED") {
           const frame: Frame = { 
             type: "TEXT", 
             text: data.payload,
             textId: Date.now().toString(),
             senderId: data.peer || "unknown",
             senderName: data.peer ? data.peer.substring(0, 6) : "Peer",
             sentAt: Date.now()
           };
           // We route incoming messages to the UI listeners
           this.frameListeners.forEach(l => l(frame, data.peer));
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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    if (frame.type === "TEXT") {
      // In btchat, Host sends to specific targets, but Members send to "HOST_PEER_ID"
      // In AirDrop-X Mesh, we just send to all known peers for simplicity of the UI mapping.
      const targets = this.peers.size > 0 ? Array.from(this.peers) : ["ffffffffffff"];
      
      for (const target of targets) {
         this.ws.send(JSON.stringify({
            type: "SEND_MESSAGE",
            target_peer: target,
            payload: frame.text
         }));
      }
    } else if (frame.type === "JOIN") {
      // Ignore, daemon handles handshakes
    }
  }

  onFrame(callback: FrameListener): Unsubscribe {
    this.frameListeners.add(callback);
    return () => this.frameListeners.delete(callback);
  }
  
  onPeerEvent(callback: PeerListener): Unsubscribe {
    this.peerListeners.add(callback);
    return () => this.peerListeners.delete(callback);
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

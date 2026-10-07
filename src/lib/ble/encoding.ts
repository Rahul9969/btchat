import { Frame, FrameType, FrameTypeName } from "./frames";

const HEADER_SIZE = 7;

let nextMessageId = 0;

function getMessageId(): number {
  const id = nextMessageId;
  nextMessageId = (nextMessageId + 1) % 65536;
  return id;
}

export function encodeFrame(frame: Frame, maxPacketSize = 20): Uint8Array[] {
  const maxPayloadSize = maxPacketSize - HEADER_SIZE;
  if (maxPayloadSize <= 0) {
    throw new Error("maxPacketSize is too small for header");
  }

  let fullPayload: Uint8Array;

  if (frame.type === "FILE_CHUNK") {
    const fileIdBytes = new TextEncoder().encode(frame.fileId);
    if (fileIdBytes.length > 255) {
      throw new Error("fileId is too long");
    }
    fullPayload = new Uint8Array(1 + fileIdBytes.length + 4 + frame.data.length);
    fullPayload[0] = fileIdBytes.length;
    fullPayload.set(fileIdBytes, 1);
    const dv = new DataView(fullPayload.buffer, fullPayload.byteOffset, fullPayload.byteLength);
    dv.setUint32(1 + fileIdBytes.length, frame.index, true);
    fullPayload.set(frame.data, 1 + fileIdBytes.length + 4);
  } else {
    fullPayload = new TextEncoder().encode(JSON.stringify(frame));
  }

  const total = Math.ceil(fullPayload.length / maxPayloadSize) || 1;
  const messageId = getMessageId();
  const typeCode = FrameType[frame.type];
  const packets: Uint8Array[] = [];

  for (let sequence = 0; sequence < total; sequence++) {
    const offset = sequence * maxPayloadSize;
    const chunk = fullPayload.subarray(offset, offset + maxPayloadSize);
    
    const packet = new Uint8Array(HEADER_SIZE + chunk.length);
    const dv = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
    
    dv.setUint8(0, typeCode);
    dv.setUint16(1, messageId, true);
    dv.setUint16(3, sequence, true);
    dv.setUint16(5, total, true);
    
    packet.set(chunk, HEADER_SIZE);
    packets.push(packet);
  }

  return packets;
}

const FrameTypeReverse = Object.fromEntries(
  Object.entries(FrameType).map(([k, v]) => [v, k])
) as Record<number, FrameTypeName>;

const MAX_CHUNKS = 2000;
const TTL_MS = 60000; // 60 seconds

export class FrameDecoder {
  // Map of "senderId-messageId" -> { chunks, timestamp }
  private buffers = new Map<string, { chunks: Uint8Array[]; timestamp: number }>();

  /**
   * Processes an incoming packet. If it completes a Frame, returns the Frame.
   * Otherwise returns null.
   */
  handlePacket(packet: Uint8Array, from: string = "unknown"): Frame | null {
    if (packet.length < HEADER_SIZE) {
      console.warn("Packet too small to contain header");
      return null;
    }

    const dv = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
    const typeCode = dv.getUint8(0);
    const messageId = dv.getUint16(1, true);
    const sequence = dv.getUint16(3, true);
    const total = dv.getUint16(5, true);

    const typeName = FrameTypeReverse[typeCode];
    if (!typeName) {
      console.warn(`Unknown frame type code: ${typeCode}`);
      return null;
    }

    if (total > MAX_CHUNKS) {
      console.warn(`Packet rejected: total chunks (${total}) exceeds MAX_CHUNKS (${MAX_CHUNKS})`);
      return null;
    }

    const payloadChunk = packet.subarray(HEADER_SIZE);
    const key = `${from}-${messageId}`;
    
    // Prune stale buffers occasionally to prevent memory leaks
    const now = Date.now();
    if (this.buffers.size > 50) {
      for (const [k, v] of this.buffers.entries()) {
        if (now - v.timestamp > TTL_MS) {
          this.buffers.delete(k);
        }
      }
    }

    let bufferEntry = this.buffers.get(key);
    if (!bufferEntry) {
      bufferEntry = { chunks: new Array(total), timestamp: now };
      this.buffers.set(key, bufferEntry);
    } else {
      bufferEntry.timestamp = now; // Update timestamp
    }
    
    const chunks = bufferEntry.chunks;
    chunks[sequence] = payloadChunk;

    // Check if we have all chunks
    let complete = true;
    let totalLength = 0;
    for (let i = 0; i < total; i++) {
      if (!chunks[i]) {
        complete = false;
        break;
      }
      totalLength += chunks[i].length;
    }

    if (!complete) {
      return null;
    }

    // We have the complete frame
    this.buffers.delete(key);

    const fullPayload = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      fullPayload.set(chunk, offset);
      offset += chunk.length;
    }

    try {
      if (typeName === "FILE_CHUNK") {
        const fileIdLength = fullPayload[0];
        const fileId = new TextDecoder().decode(fullPayload.subarray(1, 1 + fileIdLength));
        const payloadDv = new DataView(fullPayload.buffer, fullPayload.byteOffset, fullPayload.byteLength);
        const index = payloadDv.getUint32(1 + fileIdLength, true);
        const data = fullPayload.slice(1 + fileIdLength + 4);
        return {
          type: "FILE_CHUNK",
          fileId,
          index,
          data,
        };
      } else {
        const json = new TextDecoder().decode(fullPayload);
        const frame = JSON.parse(json);
        
        if (!frame || typeof frame !== 'object') {
          console.warn("Invalid frame: not a JSON object");
          return null;
        }

        // Basic safety check for frame structure
        if (frame.type !== typeName) {
          console.warn(`Frame type mismatch: header=${typeName}, payload=${frame.type}`);
          return null;
        }
        
        return frame as Frame;
      }
    } catch (e) {
      console.error("Failed to parse reconstructed frame", e);
      return null;
    }
  }

  /** Call this when disconnected or when memory needs to be freed */
  reset() {
    this.buffers.clear();
  }
}

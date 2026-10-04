import { describe, expect, it } from "vitest";
import { encodeFrame, FrameDecoder } from "./encoding";
import { Frame, JoinFrame, MemberListFrame, FileChunkFrame } from "./frames";

describe("Frame encoding and decoding", () => {
  it("encodes and decodes a simple JSON frame in one packet", () => {
    const frame: JoinFrame = {
      type: "JOIN",
      displayName: "Alice",
    };

    // A maxPacketSize of 100 is plenty for this small frame
    const packets = encodeFrame(frame, 100);
    expect(packets.length).toBe(1);

    const decoder = new FrameDecoder();
    const result = decoder.handlePacket(packets[0]);

    expect(result).toEqual(frame);
  });

  it("splits and reassembles a large JSON frame across multiple packets", () => {
    const members = Array.from({ length: 50 }).map((_, i) => ({
      memberId: `mem-${i}`,
      displayName: `User ${i}`,
      isHost: i === 0,
    }));

    const frame: MemberListFrame = {
      type: "MEMBER_LIST",
      members,
    };

    const packets = encodeFrame(frame, 20); // very small MTU
    expect(packets.length).toBeGreaterThan(1);

    const decoder = new FrameDecoder();
    let result: Frame | null = null;
    
    for (let i = 0; i < packets.length; i++) {
      result = decoder.handlePacket(packets[i]);
      if (i < packets.length - 1) {
        expect(result).toBeNull();
      }
    }

    expect(result).toEqual(frame);
  });

  it("encodes and decodes a FILE_CHUNK frame correctly", () => {
    const data = new Uint8Array(256);
    for (let i = 0; i < data.length; i++) {
      data[i] = i;
    }

    const frame: FileChunkFrame = {
      type: "FILE_CHUNK",
      fileId: "file-123456",
      index: 42,
      data,
    };

    const packets = encodeFrame(frame, 50);
    expect(packets.length).toBeGreaterThan(1);

    const decoder = new FrameDecoder();
    let result: Frame | null = null;
    
    for (const packet of packets) {
      result = decoder.handlePacket(packet);
    }

    expect(result).not.toBeNull();
    expect(result?.type).toBe("FILE_CHUNK");
    if (result?.type === "FILE_CHUNK") {
      expect(result.fileId).toBe("file-123456");
      expect(result.index).toBe(42);
      expect(result.data).toEqual(data);
    }
  });

  it("handles out-of-order interleaved packets from different frames", () => {
    const frame1: JoinFrame = { type: "JOIN", displayName: "Bob" };
    const frame2: JoinFrame = { type: "JOIN", displayName: "Charlie" };

    const packets1 = encodeFrame(frame1, 15);
    const packets2 = encodeFrame(frame2, 15);

    expect(packets1.length).toBeGreaterThan(1);
    expect(packets2.length).toBeGreaterThan(1);

    const decoder = new FrameDecoder();
    
    let result1: Frame | null = null;
    let result2: Frame | null = null;

    const maxLen = Math.max(packets1.length, packets2.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < packets1.length) {
        const r = decoder.handlePacket(packets1[i]);
        if (r) result1 = r;
      }
      if (i < packets2.length) {
        const r = decoder.handlePacket(packets2[i]);
        if (r) result2 = r;
      }
    }

    expect(result1).toEqual(frame1);
    expect(result2).toEqual(frame2);
  });
});

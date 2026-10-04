/**
 * GATT layout for the Group service.
 * The UUIDs were generated once with crypto.randomUUID(). Do not change them:
 * the web code and the native plugin must use the same values.
 */
export const SERVICE_UUID = "1e764b4c-cfb2-4faa-ad44-d612e786b7dc";

/** Read. UTF-8 JSON: { groupId, groupName, memberCount }. */
export const GROUP_INFO_CHAR_UUID = "bc3e66f2-06fa-459e-b233-54171319f441";

/** Write without response. A Member writes Packets to the Host. */
export const RX_CHAR_UUID = "3dce72e0-e4ec-4519-853d-c4d0ab32cf24";

/** Notify. The Host sends Packets to Members. */
export const TX_CHAR_UUID = "0d3b31ae-1e11-4d89-af80-9cee9a79733f";

/** ATT header bytes that a write or notification loses from the MTU. */
export const ATT_OVERHEAD_BYTES = 3;

/** The BLE default MTU is 23 bytes, so a Packet is 20 bytes when the MTU is not known. */
export const DEFAULT_PACKET_SIZE = 20;

/** type (1) + messageId (2) + sequence (2) + total (2). */
export const PACKET_HEADER_SIZE = 7;

/** Members per Group, not counting the Host. Many phones limit concurrent BLE connections. */
export const MAX_MEMBERS = 6;

export const GROUP_NAME_MIN = 1;
export const GROUP_NAME_MAX = 24;
export const DISPLAY_NAME_MIN = 1;
export const DISPLAY_NAME_MAX = 20;

/** How long a Member waits for the Host to answer a connect or a JOIN. */
export const CONNECT_TIMEOUT_MS = 8000;

/** A scan stops after this time to save battery. The user can tap "Rescan". */
export const SCAN_DURATION_MS = 12000;

/** Peer id that a Member uses for its Host. */
export const HOST_PEER_ID = "host";

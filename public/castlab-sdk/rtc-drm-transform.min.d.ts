declare function rtcDrmGetVersion(): string;

/**
 * DRMtoday Environment
 */
declare class rtcDrmEnvironments {
    /**
     * The DRMtoday staging environment
     */
    static Production: rtcDrmEnvironments;
    /**
     * The DRMtoday production environment
     */
    static Production: rtcDrmEnvironments;
    /**
     * The DRMtoday development environment
     */
    static Development: rtcDrmEnvironments;
    private readonly name;
    private constructor();
    toString(): string;
    baseUrl(): "https://lic.staging.drmtoday.com" | "https://lic.test.drmtoday.com" | "https://lic.drmtoday.com";
    certificate(): Uint8Array;
}

interface EncryptedEncodedFrame {
    type: string;
    timestamp: number;
    data: ArrayBuffer;
}
type EncryptionType = 'clear' | 'cbcs' | 'cenc';
type Robustness = 'SW' | 'HW';
type Codec = 'H264' | 'AV1' | 'opus';
type KeySystemType = 'ClearKey' | 'Widevine' | 'FairPlay' | 'PlayReady';
declare const enum LogLevel {
    None = 0,
    Error = 1,
    Warn = 2,
    Info = 3,
    Debug = 4
}

/**
 * Configure video and audio tracks
 */
interface TrackConfig {
    keyId?: Uint8Array;
    iv?: Uint8Array;
    robustness?: Robustness;
    encryption: EncryptionType;
    codec: Codec;
}
/**
 * The DRM Configuration object
 */
interface DrmConfig {
    /**
     * The primary video element
     */
    videoElement: HTMLVideoElement;
    /**
     * Optional additional audio element
     */
    audioElement?: HTMLAudioElement;
    /**
     * Optional insertable stream transform mode. If set to true,
     * you're supposed to set up RTCRtpScriptTransform/TransformStream
     * yourself and pass incoming frames to the library via rtcDrmFeedFrame(),
     * see custom-transform sample app for details.
     */
    customTransform?: boolean;
    /**
     * Optionally set a target key system type. This is only needed for
     * environment where more than one key system is available, and you
     * want to select a specific one, or you want to force using ClearKey
     * (which is always available).
     *
     * Possible values are 'ClearKey', 'Widevine', 'FairPlay', or 'PlayReady'.
     *
     * Note that playback might not work if you select a key system type that
     * is not available.
     */
    type?: KeySystemType;
    /**
     * Optionally configure the internal media buffer. Leave this undefined
     * or set it to a negative value to use the default configuration.
     *
     * Note that you can experiment with this value, but it is not advised to
     * set it to 0, unless you know what you are doing.
     */
    mediaBufferMs?: number;
    /**
     * The video track config. Note that this is optional for clear
     * playback but needs to be configured for DRM protected playback.
     */
    video?: TrackConfig;
    /**
     * The audio track config. Note that this is optional for clear
     * playback but needs to be configured for DRM protected playback.
     */
    audio?: TrackConfig;
    /**
     * The DRM environment that will be used
     */
    environment: rtcDrmEnvironments;
    /**
     * The DRMtoday merchant
     */
    merchant: string;
    /**
     * The DRMtoday userId.
     *
     * Arbitrary string that is passed to the DRMtoday license server,
     * can be used for tracking or such.
     */
    userId?: string;
    /**
     * The DRMtoday sessionId.
     *
     * Ensure that you either set sessionId or the authToken
     * depending on the authorization method configured in DRMtoday.
     */
    sessionId?: string;
    /**
     * The DRMtoday auth token.
     *
     * Ensure that you either set sessionId or the authToken
     * depending on the authorization method configured in DRMtoday
     */
    authToken?: string;
    /**
     * Optional utility to intercept and modify license requests
     *
     * @param url The target URL
     * @param init The request parameters
     */
    onFetch?: (url: string, init: RequestInit) => Promise<Response>;
    /**
     * FairPlay Streaming certificate to use (avoids fetching)
     */
    fpsCertificate?: Uint8Array;
    /**
     * Alternative URL to fetch FairPlay Streaming certificate from
     */
    fpsCertificateUrl?: string;
    /**
     * Alternative URL for FairPlay Streaming license requests
     */
    fpsLicenseUrl?: string;
    /**
     * Widevine certificate to use (avoids fetching)
     */
    wvCertificate?: Uint8Array;
    /**
     * Alternative URL to fetch Widevine certificate from
     */
    wvCertificateUrl?: string;
    /**
     * Alternative URL for Widevine license requests
     */
    wvLicenseUrl?: string;
    /**
     * Alternative URL for PlayReady license requests
     */
    prLicenseUrl?: string;
    /**
     * Debug logging level. By default error, warn and info
     * messages are logged, for extra logging set logLevel to LogLevel.Debug
     */
    logLevel?: LogLevel;
    /**
     * Set these (to non-zero values) to create dumps of audio/video
     * streams (will only work for encrypted media). 'in' objects are
     * for media frames as they delivered by RTCRtpScriptTransform/TransformStream
     * (encrypted raw H.264/Opus) and 'out' ones are for fmp4-wrapped
     * frames as they're fed into the browser CDM via MSE
     */
    mediaDumps?: {
        video?: {
            in?: {
                durationMs?: number;
                delimited?: boolean;
            };
            out?: {
                durationMs?: number;
            };
        };
        audio?: {
            in?: {
                durationMs?: number;
            };
            out?: {
                durationMs?: number;
            };
        };
    };
}
declare function rtcDrmFeedFrame(encryptedEncodedFrame: EncryptedEncodedFrame, controller: TransformStreamDefaultController, drmConfig: DrmConfig): boolean;
declare function rtcDrmConfigure(drmConfig: DrmConfig): void;
declare function rtcDrmSetBufferSize(drmConfig: DrmConfig, bufferSizeMs: number): void;
declare function rtcDrmOnTrack(event: RTCTrackEvent, drmConfig: DrmConfig): void;

export { type DrmConfig, type TrackConfig, rtcDrmConfigure, rtcDrmEnvironments, rtcDrmFeedFrame, rtcDrmGetVersion, rtcDrmOnTrack, rtcDrmSetBufferSize };

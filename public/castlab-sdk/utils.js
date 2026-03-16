'use strict'

function checkCodecsPresent(sdp, codecs) {
    let sdpLines = sdp.split('\r\n')
    for (const line of sdpLines) {
        if (line.startsWith('a=rtpmap:')) {
            const ptAndCodec = line.substring(9).split(' ')
            const codec = ptAndCodec[1].split('/')[0]
            if (codecs.includes(codec))
                return true
        }
    }
    return false
}

// setCodecPreferences() is a huge mess (https://github.com/w3c/webrtc-pc/issues/2888) and doesn't work
// reliably even if we use it to configure the receiver as recommended by the webrtc elders
function removeCodecsFromSdp(sdp, codecs) {
    let sdpLines = sdp.split('\r\n')

    let ptToRemove = []
    // first pass: collect all payload types to remove (direct hits in rtpmap records)
    for (const line of sdpLines) {
        if (line.startsWith('a=rtpmap:')) {
            const ptAndCodec = line.substring(9).split(' ')
            const pt = ptAndCodec[0]
            const codec = ptAndCodec[1].split('/')[0]
            if (codecs.includes(codec))
                ptToRemove.push(pt)
        }
    }
    // second pass: collect all payload types to remove (indirect hits in fmtp/apt records)
    for (const line of sdpLines) {
        if (line.startsWith('a=fmtp:')) {
            const ptAndApt = line.substring(7).split(' ')
            const pt = ptAndApt[0]
            const apt = ptAndApt[1].split('apt=')
            if (apt.length === 2 && apt[0] === '' && ptToRemove.includes(apt[1]))
                ptToRemove.push(pt)
        }
    }

    // go through the SDP and remove all lines that contain the payload types pertaining
    // to the codecs we need to remove
    let mungedSdp = ''
    for (const line of sdpLines) {
        let lineToAdd = ''
        if (line.startsWith('a=rtpmap:') || line.startsWith('a=rtcp-fb:') || line.startsWith('a=fmtp:')) {
            const pt = line.split(':')[1].split(' ')[0]
            if (!ptToRemove.includes(pt))
                lineToAdd = line
        }
        else if (line.startsWith('m=video') || line.startsWith('m=audio')) {
            // remove all payload types we are removing from the m= line records
            const pts = line.split(' ')
            // this is the prefix which looks like 'm=video/audio 9 UDP/TLS/RTP/SAVPF',
            // after that there's a list of payload types we need to filter
            lineToAdd = pts[0] + ' ' + pts[1] + ' ' + pts[2]
            for (let i = 3; i < pts.length; ++i) {
                if (!ptToRemove.includes(pts[i]))
                    lineToAdd += ' ' + pts[i]
            }
        }
        else
            lineToAdd = line

        if (lineToAdd !== '') {
            mungedSdp += lineToAdd + '\r\n'
        }
    }

    return mungedSdp
}

export function enforceVideoCodec(sdp, codecs) {
    const codecsToKeep = Array.isArray(codecs) ? codecs : [codecs]

    // Firefox's WebRTC implementation doesn't support AV1 (as of Jan 2025), return
    // empty SDP to indicate this type of problem
    if (!checkCodecsPresent(sdp, codecsToKeep))
        throw new Error(`Requested video codec(s) is not supported by browser`)

    const allCodecs = ['VP8', 'VP9', 'H264', 'H265', 'AV1']
    const codecsToRemove = allCodecs.filter(codec => !codecsToKeep.includes(codec))

    return removeCodecsFromSdp(sdp, codecsToRemove)
}

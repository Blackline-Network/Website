// Pure helpers for readiness component IDs and bounded Discord embed fields.
function boundedLines(lines, limit = 1024) {
    const kept = [];
    let length = 0;
    for (const line of lines) {
        const nextLength = length + (kept.length ? 1 : 0) + line.length;
        if (nextLength > limit) break;
        kept.push(line);
        length = nextLength;
    }
    if (kept.length < lines.length) {
        while (kept.length) {
            const suffix = `…and ${lines.length - kept.length} more`;
            const output = `${kept.join('\n')}\n${suffix}`;
            if (output.length <= limit) return output;
            kept.pop();
        }
        const suffix = `…and ${lines.length} more`;
        return suffix.length <= limit ? suffix : suffix.slice(0, limit);
    }
    return kept.join('\n') || 'No entries to display.';
}

function canCreateReadinessPanel({ savedMessageId, historyFetched, recoveredMessage }) {
    // Never auto-post a replacement when a saved message reference went stale: the
    // original panel may simply be outside the scan window, and posting would duplicate it.
    if (recoveredMessage) return false;
    if (savedMessageId) return false;
    return historyFetched === true;
}

function parseReadinessCustomId(customId) {
    const prefix = 'blackline_readiness_';
    if (typeof customId !== 'string' || !customId.startsWith(prefix)) return null;
    const rawId = customId.slice(prefix.length);
    const notReadyAction = rawId.endsWith('_notready');
    const readyAction = !notReadyAction && rawId.endsWith('_ready');
    if (!notReadyAction && !readyAction) return null;
    const encodedName = rawId.replace(/_(?:notready|ready)$/, '');
    try {
        const name = decodeURIComponent(encodedName);
        return name ? { name, ready: readyAction } : null;
    } catch {
        return null;
    }
}

module.exports = { boundedLines, parseReadinessCustomId, canCreateReadinessPanel };

/**
 * Anyong UI Client Runtime Bridge
 * Connects frontend UI components to DSH backend services and official DSH slots.
 */
export class AnyongDshClient {
    endpoint;
    constructor(endpoint = '') {
        this.endpoint = endpoint || (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3210');
    }
    async getBrandInfo() {
        const res = await fetch(`${this.endpoint}/api/anyong/brand`);
        if (!res.ok)
            return { brandName: 'Anyong DSH', theme: 'dark' };
        return res.json();
    }
    async getSessionOverview(sessionId) {
        const res = await fetch(`${this.endpoint}/api/session/${sessionId}`);
        if (!res.ok)
            throw new Error('Session not found');
        return res.json();
    }
}
//# sourceMappingURL=client.js.map
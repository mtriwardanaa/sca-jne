const fs = require('fs');
const path = require('path');

const MASTER_FILE = path.join(__dirname, '../../data/master.json');

class Store {
    constructor() {
        this.data = [];
        this.history = [];
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(MASTER_FILE)) {
                const raw = fs.readFileSync(MASTER_FILE, 'utf-8');
                const parsed = JSON.parse(raw);
                this.data = parsed.data || [];
                this.history = parsed.history || [];
            }
        } catch (err) {
            console.error('Error loading master data:', err.message);
            this.data = [];
            this.history = [];
        }
    }

    save() {
        const dir = path.dirname(MASTER_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(MASTER_FILE, JSON.stringify({
            data: this.data,
            history: this.history,
            lastUpdated: new Date().toISOString()
        }, null, 2));
    }

    setMasterData(couriers) {
        this.data = couriers;
        this.save();
    }

    getMasterData() {
        return this.data;
    }

    getMasterCount() {
        return this.data.length;
    }

    clearMasterData() {
        this.data = [];
        this.save();
    }

    lookup(courierIds) {
        const ids = courierIds.map(id => id.trim().toUpperCase());
        const found = [];
        const notFound = [];

        for (const id of ids) {
            const courier = this.data.find(c => c.courier_id.toUpperCase() === id);
            if (courier) {
                found.push(courier);
            } else {
                notFound.push(id);
            }
        }

        return { found, notFound };
    }

    addHistory(entry) {
        this.history.unshift({
            ...entry,
            timestamp: new Date().toISOString()
        });
        // Keep last 100 entries
        if (this.history.length > 100) {
            this.history = this.history.slice(0, 100);
        }
        this.save();
    }

    getHistory() {
        return this.history;
    }
}

module.exports = new Store();

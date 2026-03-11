# 🌿 Smart Panchayat Kerala — IoT Monitoring System

A full-stack dashboard for monitoring sensor data across Kerala's panchayat system. Built with React + Tailwind CSS (frontend), Node.js + Express (backend), MySQL (relational data), and InfluxDB (time-series sensor readings).

---

## 🏗️ Architecture

```
smart-panchayat/
├── backend/               # Node.js + Express API
│   ├── config/
│   │   ├── db.js          # MySQL connection pool
│   │   ├── influx.js      # InfluxDB client
│   │   └── schema.sql     # Database schema + seed data
│   ├── middleware/
│   │   └── auth.js        # JWT auth + role-based access control
│   ├── routes/
│   │   ├── auth.js        # POST /api/auth/login
│   │   ├── locations.js   # GET districts/blocks/panchayats
│   │   ├── villagers.js   # CRUD villagers
│   │   └── sensors.js     # CRUD sensors + InfluxDB queries
│   └── server.js          # Express entry point
│
└── frontend/              # React + Tailwind CSS
    └── src/
        ├── api/           # Axios API calls
        ├── context/
        │   ├── AuthContext.jsx       # User auth + JWT
        │   └── PanchayatContext.jsx  # Location selection state
        ├── components/dashboard/
        │   ├── Sidebar.jsx           # Collapsible left panel
        │   ├── StatsBar.jsx          # Live sensor/villager counts
        │   ├── VillagerSearch.jsx    # Search + view villagers
        │   ├── SensorSearch.jsx      # Search + sensor data charts
        │   ├── VillagerFormModal.jsx # Add/edit villager
        │   └── SensorFormModal.jsx  # Add/edit sensor
        └── pages/
            ├── LoginPage.jsx
            └── DashboardPage.jsx
```

---

## ⚙️ Prerequisites

- Node.js ≥ 18
- MySQL 8.0+
- InfluxDB 2.x
- npm or yarn

---

## 🚀 Setup

### 1. MySQL Setup

```sql
-- Run the schema file
mysql -u root -p < backend/config/schema.sql
```

This creates:
- `locations` table (districts, blocks, panchayats)
- `users` table (4 demo accounts)
- `villagers` table
- `sensors` table
- Seed data for all 14 Kerala districts + sample Thrissur blocks/panchayats

### 2. InfluxDB Setup

Your InfluxDB bucket should have measurements named: `{DistrictName}_{SensorType}`

Examples:
- `Ernakulam_Temp`
- `Kannur_WaterPH`
- `Thrissur_Humidity`

Each measurement should have a **tag**: `sensor_id` matching the sensor ID in MySQL.

**Field name**: the unit value (e.g., `temperature`, `ph`, or `value`)

### 3. Backend Setup

```bash
cd backend
npm install

# Copy and fill in your config
cp .env.example .env
# Edit .env with your MySQL and InfluxDB credentials

npm run dev        # Development (nodemon)
# or
npm start          # Production
```

### 4. Frontend Setup

```bash
cd frontend
npm install
npm start          # Dev server on http://localhost:3000
```

The frontend proxies `/api/*` requests to `http://localhost:5000` via the `proxy` field in `package.json`.

---

## 👤 User Accounts (Demo)

All demo accounts use password: **`password`**

| Username | Role | Access |
|---|---|---|
| `state_admin` | State | View all districts in Kerala |
| `thrissur_admin` | District | View all blocks/panchayats in Thrissur |
| `chalakudy_admin` | Block | View all panchayats in Chalakudy block |
| `mala_admin` | Panchayat | Full CRUD for Mala Panchayat |

> ⚠️ The demo passwords in `schema.sql` use a placeholder hash. Generate real bcrypt hashes:
> ```js
> const bcrypt = require('bcryptjs');
> bcrypt.hash('yourpassword', 10).then(console.log);
> ```

---

## 📡 API Endpoints

### Auth
| Method | URL | Description |
|---|---|---|
| POST | `/api/auth/login` | Login, returns JWT token |
| GET | `/api/auth/me` | Get current user info |

### Locations
| Method | URL | Description |
|---|---|---|
| GET | `/api/locations/districts` | All 14 Kerala districts |
| GET | `/api/locations/blocks/:districtId` | Blocks in a district |
| GET | `/api/locations/panchayats/:blockId` | Panchayats in a block |
| GET | `/api/locations/hierarchy` | Accessible locations for current user |

### Villagers
| Method | URL | Description |
|---|---|---|
| GET | `/api/villagers?panchayatId=X&search=name` | List/search villagers |
| GET | `/api/villagers/:id` | Villager detail with sensors |
| POST | `/api/villagers` | Create villager (panchayat role only) |
| PUT | `/api/villagers/:id` | Update villager (panchayat role only) |
| DELETE | `/api/villagers/:id` | Delete villager (panchayat role only) |

### Sensors
| Method | URL | Description |
|---|---|---|
| GET | `/api/sensors?panchayatId=X&search=id&type=Temp` | List/filter sensors |
| GET | `/api/sensors/:id` | Sensor detail + latest InfluxDB reading |
| GET | `/api/sensors/:id/history?range=24h` | Historical readings from InfluxDB |
| GET | `/api/sensors/stats/:panchayatId` | Dashboard stats (counts) |
| POST | `/api/sensors` | Create sensor (panchayat role only) |
| PUT | `/api/sensors/:id` | Update sensor (panchayat role only) |
| DELETE | `/api/sensors/:id` | Delete sensor (panchayat role only) |

---

## 🧩 InfluxDB Query Format

Sensor readings are queried using:
```flux
from(bucket: "sensor_data")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "Thrissur_Temp")
  |> filter(fn: (r) => r.sensor_id == "SENSOR_001")
  |> last()
```

The measurement name is automatically derived from the sensor's assigned district and type: `{district_name}_{type}`.

---

## 🎨 Design System

- **Colors**: Dark theme with Kerala green (`#22c55e`) as primary accent
- **Font**: Sora (Google Fonts)
- **Framework**: Tailwind CSS utility classes
- **Icons**: Lucide React
- **Charts**: Recharts (for sensor history graphs)

---

## 🔮 Next Steps (Planned)

- Real-time WebSocket updates for live sensor values
- Sensor alert/threshold configuration
- Map view of panchayat sensors by GPS coordinates
- Export data (CSV/PDF reports)
- Notification system for faulty sensors

---

## 🗂️ Role Permission Matrix

| Action | State | District | Block | Panchayat |
|---|:---:|:---:|:---:|:---:|
| View all districts | ✅ | ❌ | ❌ | ❌ |
| View own district | ✅ | ✅ | ❌ | ❌ |
| View own block | ✅ | ✅ | ✅ | ❌ |
| View own panchayat | ✅ | ✅ | ✅ | ✅ |
| Add/Edit villagers | ❌ | ❌ | ❌ | ✅ |
| Add/Edit sensors | ❌ | ❌ | ❌ | ✅ |
| Delete villagers | ❌ | ❌ | ❌ | ✅ |
| Delete sensors | ❌ | ❌ | ❌ | ✅ |

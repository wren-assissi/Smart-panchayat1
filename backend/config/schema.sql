-- Smart Panchayat Database Schema

CREATE DATABASE IF NOT EXISTS smart_panchayat;
USE smart_panchayat;

-- Locations table: districts, blocks, panchayats
CREATE TABLE IF NOT EXISTS locations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type ENUM('district', 'block', 'panchayat') NOT NULL,
  parent_id INT DEFAULT NULL,
  state VARCHAR(50) DEFAULT 'Kerala',
  FOREIGN KEY (parent_id) REFERENCES locations(id) ON DELETE CASCADE,
  INDEX idx_type (type),
  INDEX idx_parent (parent_id)
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150),
  role ENUM('state', 'district', 'block', 'panchayat') NOT NULL,
  location_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
);

-- Villagers table
CREATE TABLE IF NOT EXISTS villagers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  panchayat_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (panchayat_id) REFERENCES locations(id) ON DELETE CASCADE,
  INDEX idx_panchayat (panchayat_id),
  INDEX idx_name (name)
);

-- Sensor type master table
-- Stores reusable metadata for each kind of sensor.
CREATE TABLE IF NOT EXISTS sensor_definitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sensor_key VARCHAR(50) NOT NULL UNIQUE,         -- e.g., TEMP, WATER_PH, SOIL_MOISTURE
  unit VARCHAR(30) DEFAULT NULL,                  -- e.g., C, pH, ppm, %
  value_kind ENUM('number', 'boolean', 'enum') NOT NULL DEFAULT 'number',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sensor_key (sensor_key)
);

-- Sensor threshold rules table
-- Keeps threshold logic separate from sensor type identity.
-- rule_type meanings:
--   safe_range: safe_min <= value <= safe_max
--   upper_only: value <= safe_max is safe
--   lower_only: value >= safe_min is safe
CREATE TABLE IF NOT EXISTS sensor_thresholds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sensor_definition_id INT NOT NULL,
  rule_type ENUM('upper_only', 'lower_only', 'safe_range') NOT NULL,
  safe_min DECIMAL(10, 2) DEFAULT NULL,
  safe_max DECIMAL(10, 2) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (sensor_definition_id) REFERENCES sensor_definitions(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_sensor_definition_threshold (sensor_definition_id),
  INDEX idx_threshold_rule_type (rule_type)
);

-- Sensors table
CREATE TABLE IF NOT EXISTS sensors (
  id VARCHAR(50) PRIMARY KEY,  -- e.g., SENSOR_001
  name VARCHAR(150),
  type VARCHAR(50) NOT NULL,   -- e.g., Temp, WaterPH, Humidity
  status ENUM('active', 'inactive', 'faulty') DEFAULT 'active',
  location_description TEXT,
  panchayat_id INT NOT NULL,
  villager_id INT DEFAULT NULL,  -- NULL = common panchayat sensor
  district_id INT NOT NULL,      -- for influx table lookup: district_type
  installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (panchayat_id) REFERENCES locations(id) ON DELETE CASCADE,
  FOREIGN KEY (villager_id) REFERENCES villagers(id) ON DELETE SET NULL,
  FOREIGN KEY (district_id) REFERENCES locations(id),
  INDEX idx_panchayat (panchayat_id),
  INDEX idx_villager (villager_id),
  INDEX idx_type (type),
  INDEX idx_status (status)
);

-- Sample Kerala location data
INSERT INTO locations (name, type, parent_id) VALUES ('Kerala', 'district', NULL);

-- Districts
INSERT INTO locations (name, type, parent_id) VALUES
('Thiruvananthapuram', 'district', NULL),
('Kollam', 'district', NULL),
('Pathanamthitta', 'district', NULL),
('Alappuzha', 'district', NULL),
('Kottayam', 'district', NULL),
('Idukki', 'district', NULL),
('Ernakulam', 'district', NULL),
('Thrissur', 'district', NULL),
('Palakkad', 'district', NULL),
('Malappuram', 'district', NULL),
('Kozhikode', 'district', NULL),
('Wayanad', 'district', NULL),
('Kannur', 'district', NULL),
('Kasaragod', 'district', NULL);

-- Sample blocks for Thrissur (id=8 typically, adjust as needed)
-- You would add full block/panchayat data here
-- For demo: a few blocks under Thrissur
INSERT INTO locations (name, type, parent_id)
SELECT 'Chalakudy Block', 'block', id FROM locations WHERE name='Thrissur' AND type='district';

INSERT INTO locations (name, type, parent_id)
SELECT 'Kodungallur Block', 'block', id FROM locations WHERE name='Thrissur' AND type='district';

-- Sample panchayats under Chalakudy
INSERT INTO locations (name, type, parent_id)
SELECT 'Mala Panchayat', 'panchayat', id FROM locations WHERE name='Chalakudy Block';

INSERT INTO locations (name, type, parent_id)
SELECT 'Kodakara Panchayat', 'panchayat', id FROM locations WHERE name='Chalakudy Block';

-- Sample admin users (passwords are bcrypt hashed 'password123')
INSERT INTO users (username, password_hash, full_name, role, location_id) VALUES
('state_admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'State Administrator', 'state', NULL),
('thrissur_admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Thrissur District Admin', 'district', 
  (SELECT id FROM locations WHERE name='Thrissur' AND type='district')),
('chalakudy_admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Chalakudy Block Admin', 'block',
  (SELECT id FROM locations WHERE name='Chalakudy Block')),
('mala_admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Mala Panchayat Admin', 'panchayat',
  (SELECT id FROM locations WHERE name='Mala Panchayat'));
-- Note: The hashed password above = 'password' (from Laravel's Hash::make)
-- Use bcrypt to hash your real passwords

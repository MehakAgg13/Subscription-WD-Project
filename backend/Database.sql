CREATE DATABASE IF NOT EXISTS subscription_db;
USE subscription_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id UNIQUE NOT NULL,
  name VARCHAR(100),
  email VARCHAR(100) UNIQUE,
  password VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS subscription (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  name VARCHAR(100),
  amount DECIMAL(10,2),
  renewal_date DATE,
  status VARCHAR(50) DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS subscription_details (
    detail_id INT AUTO_INCREMENT PRIMARY KEY,
    subscription_id INT NOT NULL,
    category VARCHAR(100) DEFAULT NULL,
    billing_cycle ENUM('Monthly', 'Quarterly', 'Yearly') NOT NULL DEFAULT 'Monthly',
    start_date DATE NOT NULL,
    remind_before INT NOT NULL DEFAULT 7,
    notes TEXT,
     read_status TINYINT DEFAULT 0,
    dismissed TINYINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_subscription_details_subscription
        FOREIGN KEY (subscription_id) REFERENCES subscription(id)
        ON DELETE CASCADE,
    CONSTRAINT uq_subscription_details_subscription UNIQUE (subscription_id),
    CONSTRAINT chk_subscription_details_reminder CHECK (remind_before IN (3, 5, 7))
);

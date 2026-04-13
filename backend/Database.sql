CREATE DATABASE IF NOT EXISTS subscription_db;
USE subscription_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
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


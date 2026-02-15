CREATE TABLE users (
   id SERIAL PRIMARY KEY,
   email VARCHAR(100) UNIQUE NOT NULL,
   password_hash TEXT NOT NULL,
   created_at TIMESTAMP DEFAULT NOW(),
   name VARCHAR(100),
   age INTEGER,
   weight DECIMAL(4, 1),
   height DECIMAL(4, 1),
   activity_level VARCHAR(100),
   goal VARCHAR(100)
);


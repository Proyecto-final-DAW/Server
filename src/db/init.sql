CREATE TABLE users (
   id SERIAL PRIMARY KEY,
   name VARCHAR(100) NOT NULL,
   email VARCHAR(100) UNIQUE NOT NULL,
   hashed_password TEXT NOT NULL,
   tokens TEXT[] DEFAULT '{}',
   age INTEGER,
   weight DECIMAL(4, 1),
   height DECIMAL(4, 1),
   activity_level VARCHAR(100),
   goal VARCHAR(100),
   created_at TIMESTAMP DEFAULT NOW(),
   updated_at TIMESTAMP DEFAULT NOW()
);


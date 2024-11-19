import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import methodOverride from 'method-override';
import env from "dotenv";

// Define __dirname for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
env.config();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: true,
  })
);
app.use(methodOverride('_method'));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// PostgreSQL database connection


const db = new pg.Client({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: process.env.PG_PORT,
});

db.connect()
  .then(() => {
    console.log('Connected to PostgreSQL database.');
  })
  .catch((err) => {
    console.error('Database connection error:', err.message);
    process.exit(1);
  });

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public/uploads')); // Save images in 'public/uploads'
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName); // Use a timestamp to ensure unique filenames
  },
});

const upload = multer({ storage: storage });

// Routes

// Home page displaying members
// Home page displaying members categorized by role
app.get('/', (req, res) => {
  const query = 'SELECT * FROM members';
  db.query(query)
    .then((result) => {
      // Group members by role
      const categorizedMembers = result.rows.reduce((acc, member) => {
        const role = member.role || 'Uncategorized';
        if (!acc[role]) {
          acc[role] = [];
        }
        acc[role].push(member);
        return acc;
      }, {});

      res.render('index.ejs', { categorizedMembers });
    })
    .catch((err) => {
      res.status(500).send('Database error.');
    });
});

// Add a new member with role and image upload
app.post('/members', upload.single('photo'), (req, res) => {
  const { name, role, contact } = req.body;
  const photo = req.file ? `/uploads/${req.file.filename}` : null; // File path to save in DB

  const query = 'INSERT INTO members (name, role, contact, photo) VALUES ($1, $2, $3, $4)';
  db.query(query, [name, role, contact, photo])
    .then(() => {
      res.redirect('/dashboard');
    })
    .catch((err) => {
      res.status(500).send('Database error.');
    });
});

// Admin login page
app.get('/login', (req, res) => {
  res.render('login.ejs');
});

// Handle admin login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const query = 'SELECT * FROM admins WHERE username = $1';
  db.query(query, [username])
    .then((result) => {
      if (result.rows.length === 0) {
        return res.status(401).send('Invalid username or password.');
      }

      const admin = result.rows[0];
      bcrypt.compare(password, admin.password, (err, isMatch) => {
        if (err || !isMatch) {
          return res.status(401).send('Invalid username or password.');
        }
        req.session.admin = admin;
        res.redirect('/dashboard');
      });
    })
    .catch((err) => {
      res.status(500).send('Database error.');
    });
});

// Admin registration page
app.get('/register', (req, res) => {
  res.render('register.ejs');
});

// Handle admin registration
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) return res.status(500).send('Server error.');
    const query = 'INSERT INTO admins (username, password) VALUES ($1, $2)';
    db.query(query, [username, hashedPassword])
      .then(() => {
        res.redirect('/login');
      })
      .catch((err) => {
        res.status(500).send('Database error.');
      });
  });
});

// Admin dashboard to add members
// Admin dashboard to add and view members
app.get('/dashboard', (req, res) => {
  if (!req.session.admin) return res.redirect('/login');

  const query = 'SELECT * FROM members'; // Query to fetch all members
  db.query(query)
    .then((result) => {
      res.render('dashboard.ejs', { admin: req.session.admin, members: result.rows });
    })
    .catch((err) => {
      console.error('Error fetching members:', err);
      res.status(500).send('Database error.');
    });
});


// Add a new member with image upload
app.post('/members', upload.single('photo'), (req, res) => {
  const { name, role, contact } = req.body;
  const photo = req.file ? `/uploads/${req.file.filename}` : null; // File path to save in DB

  const query = 'INSERT INTO members (name, role, contact, photo) VALUES ($1, $2, $3, $4)';
  db.query(query, [name, role, contact, photo])
    .then(() => {
      res.redirect('/');
    })
    .catch((err) => {
      res.status(500).send('Database error.');
    });
});
// Delete a member
app.delete('/members/:id', (req, res) => {
  const memberId = req.params.id;

  const query = 'DELETE FROM members WHERE id = $1';
  db.query(query, [memberId])
    .then(() => {
      console.log(`Member with ID ${memberId} successfully deleted.`);
      res.redirect('/dashboard');
    })
    .catch((err) => {
      console.error(`Error deleting member with ID ${memberId}:`, err.message);
      res.status(500).send('Failed to delete member.');
    });
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

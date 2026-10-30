const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

let db;
let users;
let movies;
let bookings;

// Authentication middleware
const auth = (req, res, next) => {
  const token = req.header("x-auth-token");

  if (!token) {
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (error) {
    return res.status(401).json({ msg: "Invalid token" });
  }
};

// Generate the next numeric ID
async function getNextId(collection) {
  const lastDocument = await collection
    .find({})
    .sort({ id: -1 })
    .limit(1)
    .next();

  return lastDocument ? lastDocument.id + 1 : 1;
}

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        msg: "Please provide name, email and password",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await users.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(400).json({
        msg: "User already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = {
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      createdAt: new Date(),
    };

    const result = await users.insertOne(user);

    const token = jwt.sign(
      {
        user: {
          id: result.insertedId.toString(),
        },
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      token,
      user: {
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ msg: "Registration failed" });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        msg: "Please provide email and password",
      });
    }

    const user = await users.findOne({
      email: email.trim().toLowerCase(),
    });

    if (!user) {
      return res.status(400).json({
        msg: "Invalid credentials",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        msg: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      {
        user: {
          id: user._id.toString(),
        },
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ msg: "Login failed" });
  }
});

// Get movies
app.get("/api/movies", async (req, res) => {
  try {
    const movieList = await movies.find({}).sort({ id: 1 }).toArray();
    res.json(movieList);
  } catch (error) {
    console.error("Fetch movies error:", error);
    res.status(500).json({ msg: "Unable to fetch movies" });
  }
});

// Seed movies
app.get("/api/movies/seed", async (req, res) => {
  try {
    const existingCount = await movies.countDocuments();

    if (existingCount > 0) {
      return res.json({
        msg: "Movies already exist",
      });
    }

    const seedMovies = [
      {
        id: 1,
        title: "Inception",
        genre: "Sci-Fi",
        duration: 148,
        showtimes: ["12:00 PM", "3:30 PM", "7:00 PM"],
        availableSeats: 40,
      },
      {
        id: 2,
        title: "The Dark Knight",
        genre: "Action",
        duration: 152,
        showtimes: ["1:00 PM", "4:30 PM", "8:00 PM"],
        availableSeats: 35,
      },
      {
        id: 3,
        title: "Interstellar",
        genre: "Adventure",
        duration: 169,
        showtimes: ["11:00 AM", "5:00 PM"],
        availableSeats: 28,
      },
    ];

    await movies.insertMany(seedMovies);

    res.json({
      msg: "Movies added and saved successfully!",
    });
  } catch (error) {
    console.error("Seed error:", error);
    res.status(500).json({ msg: "Unable to seed movies" });
  }
});

// Create booking
app.post("/api/bookings", auth, async (req, res) => {
  try {
    const { movieId, showtime, seatsBooked } = req.body;

    const id = Number(movieId);
    const seatCount = Number(seatsBooked);

    if (
      !Number.isSafeInteger(id) ||
      !Number.isInteger(seatCount) ||
      seatCount < 1 ||
      seatCount > 10 ||
      !showtime
    ) {
      return res.status(400).json({
        msg: "Invalid movie, showtime or seat count",
      });
    }

    const movie = await movies.findOne({ id });

    if (!movie) {
      return res.status(404).json({ msg: "Movie not found" });
    }

    if (!movie.showtimes.includes(showtime)) {
      return res.status(400).json({ msg: "Invalid showtime" });
    }

    // Atomically reserve seats to prevent overbooking
    const updatedMovie = await movies.findOneAndUpdate(
      {
        id,
        availableSeats: { $gte: seatCount },
      },
      {
        $inc: { availableSeats: -seatCount },
      },
      { returnDocument: "after" }
    );

    if (!updatedMovie) {
      return res.status(400).json({
        msg: "Not enough seats available",
      });
    }

    const booking = {
      id: await getNextId(bookings),
      user: req.user.id,
      movie: {
        id: movie.id,
        title: movie.title,
        genre: movie.genre,
      },
      showtime,
      seatsBooked: seatCount,
      createdAt: new Date(),
    };

    await bookings.insertOne(booking);

    res.status(201).json({
      msg: "Booking successful",
      booking,
    });
  } catch (error) {
    console.error("Booking error:", error);
    res.status(500).json({ msg: "Booking failed" });
  }
});

// Get current user's bookings
app.get("/api/bookings/my-bookings", auth, async (req, res) => {
  try {
    const userBookings = await bookings
      .find({ user: req.user.id })
      .sort({ id: -1 })
      .toArray();

    res.json(userBookings);
  } catch (error) {
    console.error("Fetch bookings error:", error);
    res.status(500).json({ msg: "Unable to fetch bookings" });
  }
});

// Cancel booking
app.delete("/api/bookings/:id", auth, async (req, res) => {
  try {
    const bookingId = Number(req.params.id);

    if (!Number.isSafeInteger(bookingId)) {
      return res.status(400).json({ msg: "Invalid booking ID" });
    }

    const booking = await bookings.findOne({
      id: bookingId,
      user: req.user.id,
    });

    if (!booking) {
      return res.status(404).json({
        msg: "Booking not found",
      });
    }

    // Restore seats before deleting the booking
    const result = await bookings.deleteOne({
      _id: booking._id,
      user: req.user.id,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        msg: "Booking not found",
      });
    }

    await movies.updateOne(
      { id: booking.movie.id },
      { $inc: { availableSeats: booking.seatsBooked } }
    );

    res.json({ msg: "Booking cancelled successfully" });
  } catch (error) {
    console.error("Cancellation error:", error);
    res.status(500).json({ msg: "Cancellation failed" });
  }
});

// Home route
app.get("/", (req, res) => {
  res.send("IMOVIES Backend is running successfully!");
});

// Connect to MongoDB
async function startServer() {
  try {
    if (!MONGODB_URI) {
      throw new Error("MONGODB_URI is missing in environment variables");
    }

    if (!JWT_SECRET) {
      throw new Error("JWT_SECRET is missing in environment variables");
    }

    const client = new MongoClient(MONGODB_URI);

    await client.connect();

    db = client.db("imovies");

    users = db.collection("users");
    movies = db.collection("movies");
    bookings = db.collection("bookings");

    await users.createIndex({ email: 1 }, { unique: true });
    await movies.createIndex({ id: 1 }, { unique: true });
    await bookings.createIndex({ id: 1 }, { unique: true }); 

    // Automatically add movies if database is empty
const movieCount = await movies.countDocuments();

if (movieCount === 0) {
  const defaultMovies = [
    {
      id: 1,
      title: "Inception",
      genre: "Sci-Fi",
      duration: 148,
      showtimes: ["12:00 PM", "3:30 PM", "7:00 PM"],
      availableSeats: 40,
    },
    {
      id: 2,
      title: "The Dark Knight",
      genre: "Action",
      duration: 152,
      showtimes: ["1:00 PM", "4:30 PM", "8:00 PM"],
      availableSeats: 35,
    },
    {
      id: 3,
      title: "Interstellar",
      genre: "Adventure",
      duration: 169,
      showtimes: ["11:00 AM", "5:00 PM"],
      availableSeats: 28,
    },
  ];

  await movies.insertMany(defaultMovies);
  console.log("Default movies added automatically!");
} else {
  console.log("Movies already exist. No changes made.");
}

    console.log("MongoDB connected successfully!");

    app.listen(PORT, () => {
      console.log(`Server successfully started on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
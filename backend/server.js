const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const loki = require('lokijs');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;


// Database collections
let db;
let users;
let movies;
let bookings;

// Authentication middleware
const auth = (req, res, next) => {
    const token = req.header('x-auth-token');

    if (!token) {
        return res.status(401).json({
            msg: 'Authorization denied'
        });
    }

    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'supersecretkey123'
        );

        req.user = decoded.user;
        next();
    } catch (err) {
        return res.status(400).json({
            msg: 'Token validation failed'
        });
    }
};

// Register
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;

    try {
        if (!name || !email || !password) {
            return res.status(400).json({
                msg: 'Please provide name, email and password'
            });
        }

        const existingUser = users.findOne({ email });

        if (existingUser) {
            return res.status(400).json({
                msg: 'User already exists'
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = users.insert({
            name,
            email,
            password: hashedPassword
        });

        const payload = {
            user: { id: user.$loki }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET || 'supersecretkey123',
            { expiresIn: '1h' },
            (err, token) => {
                if (err) {
                    return res.status(500).json({
                        msg: 'Could not create token'
                    });
                }

                res.json({
                    token,
                    user: { name, email }
                });
            }
        );
    } catch (err) {
        console.error('Registration error:', err);

        res.status(500).json({
            msg: 'Server Error'
        });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = users.findOne({ email });

        if (!user) {
            return res.status(400).json({
                msg: 'Invalid Credentials'
            });
        }

        const isMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!isMatch) {
            return res.status(400).json({
                msg: 'Invalid Credentials'
            });
        }

        const payload = {
            user: { id: user.$loki }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET || 'supersecretkey123',
            { expiresIn: '1h' },
            (err, token) => {
                if (err) {
                    return res.status(500).json({
                        msg: 'Could not create token'
                    });
                }

                res.json({
                    token,
                    user: {
                        name: user.name,
                        email: user.email
                    }
                });
            }
        );
    } catch (err) {
        console.error('Login error:', err);

        res.status(500).json({
            msg: 'Server Error'
        });
    }
});

// Get movies
app.get('/api/movies', (req, res) => {
    res.json(movies.find());
});

// Seed movies
app.get('/api/movies/seed', (req, res) => {
    try {
        const seedMovies = [
            {
                title: 'Inception',
                genre: 'Sci-Fi',
                duration: 148,
                showtimes: ['12:00 PM', '3:30 PM', '7:00 PM'],
                availableSeats: 40
            },
            {
                title: 'The Dark Knight',
                genre: 'Action',
                duration: 152,
                showtimes: ['1:00 PM', '4:30 PM', '8:00 PM'],
                availableSeats: 35
            },
            {
                title: 'Interstellar',
                genre: 'Adventure',
                duration: 169,
                showtimes: ['11:00 AM', '5:00 PM'],
                availableSeats: 28
            }
        ];

        // Do not overwrite movies if they already exist.
        if (movies.count() > 0) {
            return res.json({
                msg: 'Movies already exist. Existing data was preserved.'
            });
        }

        seedMovies.forEach(movie => movies.insert(movie));

        db.saveDatabase(err => {
            if (err) {
                console.error('Database save error:', err);

                return res.status(500).json({
                    msg: 'Could not save movies'
                });
            }

            res.json({
                msg: 'Movies added and saved successfully!'
            });
        });
    } catch (err) {
        console.error('Movie seeding error:', err);

        res.status(500).json({
            msg: 'Server Error'
        });
    }
});

// Create booking
app.post('/api/bookings', auth, (req, res) => {
    const { movieId, showtime, seatsBooked } = req.body;

    try {
        const numberOfSeats = Number(seatsBooked);
        const id = Number(movieId);

        if (
            !Number.isInteger(numberOfSeats) ||
            numberOfSeats < 1
        ) {
            return res.status(400).json({
                msg: 'Please select a valid number of seats'
            });
        }

        const movie = movies.findOne({ $loki: id });

        if (!movie) {
            return res.status(404).json({
                msg: 'Movie not found'
            });
        }

        if (!movie.showtimes.includes(showtime)) {
            return res.status(400).json({
                msg: 'Invalid showtime'
            });
        }

        if (movie.availableSeats < numberOfSeats) {
            return res.status(400).json({
                msg: 'Not enough seats available'
            });
        }

        movie.availableSeats -= numberOfSeats;
        movies.update(movie);

        const booking = bookings.insert({
            user: req.user.id,
            movie: {
                title: movie.title,
                genre: movie.genre
            },
            showtime,
            seatsBooked: numberOfSeats
        });

        db.saveDatabase(err => {
            if (err) {
                console.error('Booking save error:', err);

                // Roll back the in-memory changes if saving fails.
                movies.remove(movie);
                movies.insert({
                    ...movie,
                    availableSeats:
                        movie.availableSeats + numberOfSeats
                });
                bookings.remove(booking);

                return res.status(500).json({
                    msg: 'Booking could not be saved'
                });
            }

            res.json(booking);
        });
    } catch (err) {
        console.error('Booking error:', err);

        res.status(500).json({
            msg: 'Server Error'
        });
    }
});

// Get current user's bookings
app.get('/api/bookings/my-bookings', auth, (req, res) => {
    try {
        const userBookings = bookings.find({
            user: req.user.id
        });

        res.json(userBookings);
    } catch (err) {
        console.error('Fetch bookings error:', err);

        res.status(500).json({
            msg: 'Server Error'
        });
    }
});

// Cancel booking
app.delete('/api/bookings/:id', auth, (req, res) => {
    try {
        const bookingId = Number(req.params.id);

        const booking = bookings.findOne({
            $loki: bookingId,
            user: req.user.id
        });

        if (!booking) {
            return res.status(404).json({
                msg: 'Booking not found'
            });
        }

        const movie = movies.findOne({
            title: booking.movie.title
        });

        if (movie) {
            movie.availableSeats += booking.seatsBooked;
            movies.update(movie);
        }

        bookings.remove(booking);

        db.saveDatabase(err => {
            if (err) {
                console.error('Cancellation save error:', err);

                return res.status(500).json({
                    msg: 'Cancellation could not be saved'
                });
            }

            res.json({
                msg: 'Booking cancelled successfully!'
            });
        });
    } catch (err) {
        console.error('Cancellation error:', err);

        res.status(500).json({
            msg: 'Server Error'
        });
    }
});

// Backend home route
app.get('/', (req, res) => {
    res.send('IMOVIES Backend is running successfully!');
});

// Initialize permanent database
db = new loki(path.join(__dirname, 'imovies.db'), {
    adapter: new loki.LokiFsAdapter(),

    autoload: true,

    autoloadCallback: function (err) {
        if (err) {
            console.error('Database loading warning:', err);
        }

        // Load saved collections or create new ones.
        users = db.getCollection('users') ||
            db.addCollection('users');

        movies = db.getCollection('movies') ||
            db.addCollection('movies');

        bookings = db.getCollection('bookings') ||
            db.addCollection('bookings');

        // Save the initialized database.
        db.saveDatabase(saveErr => {
            if (saveErr) {
                console.error(
                    'Database initialization save error:',
                    saveErr
                );

                return;
            }

            console.log(
                'Permanent database connected successfully!'
            );

            // Start the API only after the database is ready.
            app.listen(PORT, () => {
                console.log(
                    `Server successfully started on port ${PORT}`
                );
            });
        });
    },

    autosave: true,
    autosaveInterval: 4000
});
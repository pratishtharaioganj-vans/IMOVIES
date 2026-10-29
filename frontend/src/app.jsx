import React, { useEffect, useState } from "react";
import "./app.css";

const API = "https://imovies-742a.onrender.com/api";


function App() {
  const [token, setToken] = useState(
    localStorage.getItem("token") || ""
  );

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user")) || null;
    } catch {
      return null;
    }
  });

  const [page, setPage] = useState("movies");
  const [movies, setMovies] = useState([]);
  const [bookings, setBookings] = useState([]);

  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [selectedMovie, setSelectedMovie] = useState(null);
  const [showtime, setShowtime] = useState("06:00 PM");
  const [seats, setSeats] = useState(1);

  // Display messages
  const showMessage = (text, type = "info") => {
    setMessage(text);
    setMessageType(type);
  };

  // Common API request function
  const apiRequest = async (url, options = {}, authToken = token) => {
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (authToken) {
      headers["x-auth-token"] = authToken;
    }

    const response = await fetch(`${API}${url}`, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.msg || data.message || `Request failed (${response.status})`
      );
    }

    return data;
  };

  // Fetch movies
  const fetchMovies = async () => {
    try {
      const data = await apiRequest("/movies");

      const movieList = Array.isArray(data)
        ? data
        : data.movies || [];

      setMovies(movieList);
    } catch (error) {
      showMessage(
        `Movies load nahi hui: ${error.message}`,
        "error"
      );
    }
  };

  // Fetch bookings
  const fetchBookings = async (currentToken = token) => {
    if (!currentToken) {
      setBookings([]);
      return;
    }

    try {
      const data = await apiRequest(
        "/bookings/my-bookings",
        {},
        currentToken
      );

      const bookingList = Array.isArray(data)
        ? data
        : data.bookings || [];

      setBookings(bookingList);
    } catch (error) {
      showMessage(
        `Bookings load nahi hui: ${error.message}`,
        "error"
      );
    }
  };

  // Load data after login
  useEffect(() => {
    if (token) {
      fetchMovies();
      fetchBookings(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Login / Signup
  const handleAuth = async (e) => {
    e.preventDefault();

    setLoading(true);
    showMessage("");

    try {
      let data;

      if (isSignup) {
        if (!name.trim()) {
          throw new Error("Please enter your name.");
        }

        // Register new account
        data = await apiRequest(
          "/auth/register",
          {
            method: "POST",
            body: JSON.stringify({
              name: name.trim(),
              email: email.trim(),
              password,
            }),
          },
          ""
        );
      } else {
        // Login existing account
        data = await apiRequest(
          "/auth/login",
          {
            method: "POST",
            body: JSON.stringify({
              email: email.trim(),
              password,
            }),
          },
          ""
        );
      }

      if (!data.token) {
        throw new Error("Authentication token nahi mila.");
      }

      const savedUser = data.user || {
        name: name.trim() || email.split("@")[0],
        email: email.trim(),
      };

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(savedUser));

      setUser(savedUser);
      setToken(data.token);
      setPage("movies");
      setPassword("");

      showMessage(
        isSignup
          ? "Account successfully created!"
          : "Login successful!",
        "success"
      );
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // Select a movie
  const handleSelectMovie = (movie) => {
    setSelectedMovie(movie);

    if (movie.showtimes && movie.showtimes.length > 0) {
      setShowtime(movie.showtimes[0]);
    } else {
      setShowtime("06:00 PM");
    }

    setSeats(1);
    showMessage("");

    setTimeout(() => {
      document
        .getElementById("booking-form")
        ?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  // Confirm booking
  const handleBooking = async (e) => {
    e.preventDefault();

    if (loading) return;

    if (!selectedMovie) {
      showMessage("Please select a movie first.", "error");
      return;
    }

    const movieId =
      selectedMovie.$loki ??
      selectedMovie.id ??
      selectedMovie._id;

    if (movieId === undefined || movieId === null) {
      console.error("Selected movie has no ID:", selectedMovie);

      showMessage(
        "Movie ID missing. Please refresh the page and select the movie again.",
        "error"
      );

      return;
    }

    const numberOfSeats = Number(seats);

    if (
      !Number.isInteger(numberOfSeats) ||
      numberOfSeats < 1 ||
      numberOfSeats > 10
    ) {
      showMessage("Please select between 1 and 10 seats.", "error");
      return;
    }

    setLoading(true);
    showMessage("");

    try {
      // Backend expects movieId, showtime and seatsBooked
      const bookingData = {
        movieId: Number(movieId),
        showtime,
        seatsBooked: numberOfSeats,
      };

      console.log("Sending booking request:", bookingData);

      const result = await apiRequest("/bookings", {
        method: "POST",
        body: JSON.stringify(bookingData),
      });

      console.log("Booking response:", result);

      showMessage("Your movie tickets have been booked successfully!", "success");

      setSelectedMovie(null);
      setSeats(1);

      // Refresh available seats and booking history
      await fetchMovies();
      await fetchBookings(token);

      setPage("bookings");
    } catch (error) {
      console.error("Booking failed:", error);

      showMessage(
        `Booking failed: ${error.message}`,
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  // Cancel booking
  const handleCancelBooking = async (booking) => {
    const bookingId =
      booking.$loki ??
      booking.id ??
      booking.bookingId;

    if (bookingId === undefined || bookingId === null) {
      showMessage("Booking ID nahi mila.", "error");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to cancel this booking?"
    );

    if (!confirmed) return;

    setLoading(true);
    showMessage("");

    try {
      await apiRequest(`/bookings/${bookingId}`, {
        method: "DELETE",
      });

      showMessage("Booking cancelled successfully!", "success");

      await fetchBookings(token);
      await fetchMovies();
    } catch (error) {
      showMessage(
        `Cancellation failed: ${error.message}`,
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  // Logout
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    setToken("");
    setUser(null);
    setMovies([]);
    setBookings([]);
    setSelectedMovie(null);
    setPage("movies");

    showMessage("");
  };

  // LOGIN / SIGNUP SCREEN
  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="brand-icon">🎬</div>

          <h1 className="brand-title">IMOVIES</h1>

          <p className="auth-subtitle">
            Your next favourite movie awaits.
          </p>

          <h2>
            {isSignup ? "Create Account" : "Welcome Back!"}
          </h2>

          <p className="auth-description">
            {isSignup
              ? "Join us and start booking your movie tickets."
              : "Login to discover movies and book your seats."}
          </p>

          <form onSubmit={handleAuth}>
            {isSignup && (
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}

            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {message && (
              <div className={`status-message ${messageType}`}>
                {message}
              </div>
            )}

            <button
              type="submit"
              className="primary-btn"
              disabled={loading}
            >
              {loading
                ? "Please wait..."
                : isSignup
                ? "Create Account"
                : "Login"}
            </button>
          </form>

          <p className="auth-switch">
            {isSignup
              ? "Already have an account?"
              : "Don't have an account?"}

            <button
              type="button"
              className="text-btn"
              onClick={() => {
                setIsSignup(!isSignup);
                showMessage("");
              }}
            >
              {isSignup ? " Login" : " Sign Up"}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // MAIN WEBSITE
  return (
    <div className="app-container">
      <header className="navbar">
        <button
          className="brand-title"
          onClick={() => setPage("movies")}
        >
          🎬 IMOVIES
        </button>

        <nav className="nav-links">
          <button
            className={page === "movies" ? "active" : ""}
            onClick={() => setPage("movies")}
          >
            Movies
          </button>

          <button
            className={page === "bookings" ? "active" : ""}
            onClick={() => {
              setPage("bookings");
              fetchBookings(token);
            }}
          >
            My Bookings
          </button>

          <button
            className={page === "profile" ? "active" : ""}
            onClick={() => setPage("profile")}
          >
            👤 Profile
          </button>

          <button onClick={handleLogout}>
            Logout
          </button>
        </nav>
      </header>

      <main className="main-content">
        {message && (
          <div className={`status-message ${messageType}`}>
            <span>{message}</span>

            <button
              type="button"
              onClick={() => showMessage("")}
              aria-label="Close message"
            >
              ✕
            </button>
          </div>
        )}

        {/* MOVIES PAGE */}
        {page === "movies" && (
          <>
            <section className="hero">
              <p className="hero-tag">
                YOUR CINEMA EXPERIENCE
              </p>

              <h1>
                Lights. Camera.
                <br />
                <span>Book Your Movie.</span>
              </h1>

              <p>
                Discover amazing movies and reserve your favourite seats.
              </p>
            </section>

            <section className="movies-section">
              <h2>Now Showing</h2>

              {movies.length === 0 ? (
                <div className="empty-message">
                  No movies available. Please refresh the page.
                </div>
              ) : (
                <div className="movies-grid">
                  {movies.map((movie) => (
                    <article
                      className="movie-card"
                      key={movie.$loki ?? movie.id ?? movie.title}
                    >
                      <div className="movie-poster">
                        🎬
                      </div>

                      <div className="movie-info">
                        <h3>{movie.title}</h3>

                        <p>{movie.genre || "Movie"}</p>

                        {movie.duration && (
                          <p>{movie.duration} minutes</p>
                        )}

                        <p>
                          Available seats:{" "}
                          {movie.availableSeats ?? "N/A"}
                        </p>

                        <button
                          type="button"
                          className="primary-btn"
                          onClick={() => handleSelectMovie(movie)}
                        >
                          Book Tickets
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {selectedMovie && (
              <section
                className="booking-section"
                id="booking-form"
              >
                <h2>Book Your Tickets</h2>

                <p>
                  Selected movie:{" "}
                  <strong>{selectedMovie.title}</strong>
                </p>

                <form onSubmit={handleBooking}>
                  <label htmlFor="showtime">
                    Select Showtime
                  </label>

                  <select
                    id="showtime"
                    value={showtime}
                    onChange={(e) => setShowtime(e.target.value)}
                    required
                  >
                    {(
                      selectedMovie.showtimes?.length
                        ? selectedMovie.showtimes
                        : [
                            "10:00 AM",
                            "01:00 PM",
                            "04:00 PM",
                            "06:00 PM",
                            "09:00 PM",
                          ]
                    ).map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>

                  <label htmlFor="seats">
                    Number of Seats
                  </label>

                  <input
                    id="seats"
                    type="number"
                    min="1"
                    max={Math.min(
                      10,
                      selectedMovie.availableSeats ?? 10
                    )}
                    value={seats}
                    onChange={(e) =>
                      setSeats(Number(e.target.value))
                    }
                    required
                  />

                  <button
                    className="primary-btn"
                    type="submit"
                    disabled={loading}
                  >
                    {loading
                      ? "Booking..."
                      : "Confirm Booking"}
                  </button>

                  <button
                    className="secondary-btn"
                    type="button"
                    disabled={loading}
                    onClick={() => setSelectedMovie(null)}
                  >
                    Cancel
                  </button>
                </form>
              </section>
            )}
          </>
        )}

        {/* MY BOOKINGS PAGE */}
        {page === "bookings" && (
          <section className="bookings-section">
            <h1>My Bookings 🎟️</h1>

            <p className="section-subtitle">
              Manage your movie reservations here.
            </p>

            {bookings.length === 0 ? (
              <div className="empty-message">
                <h3>No bookings yet</h3>

                <p>
                  Your movie tickets will appear here after booking.
                </p>

                <button
                  className="primary-btn"
                  onClick={() => setPage("movies")}
                >
                  Explore Movies
                </button>
              </div>
            ) : (
              <div className="bookings-list">
                {bookings.map((booking) => {
                  const bookingId =
                    booking.$loki ??
                    booking.id ??
                    booking.bookingId;

                  const movieTitle =
                    typeof booking.movie === "string"
                      ? booking.movie
                      : booking.movie?.title || "Movie";

                  return (
                    <article
                      className="booking-card"
                      key={bookingId}
                    >
                      <div>
                        <h3>{movieTitle}</h3>

                        <p>
                          Showtime:{" "}
                          {booking.showtime || "Not available"}
                        </p>

                        <p>
                          Seats:{" "}
                          {booking.seatsBooked ?? booking.seats ?? 1}
                        </p>
                      </div>

                      <button
                        type="button"
                        className="cancel-btn"
                        disabled={loading}
                        onClick={() =>
                          handleCancelBooking(booking)
                        }
                      >
                        {loading
                          ? "Please wait..."
                          : "Cancel Booking"}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* PROFILE PAGE */}
        {page === "profile" && (
          <section className="profile-section">
            <div className="profile-card">
              <div className="profile-avatar">👤</div>

              <p className="hero-tag">YOUR ACCOUNT</p>

              <h1>My Profile</h1>

              <p className="section-subtitle">
                Welcome to your IMOVIES account.
              </p>

              <div className="profile-details">
                <div className="profile-detail">
                  <span>Full Name</span>
                  <strong>
                    {user?.name || "Name not available"}
                  </strong>
                </div>

                <div className="profile-detail">
                  <span>Email Address</span>
                  <strong>
                    {user?.email || "Email not available"}
                  </strong>
                </div>

                <div className="profile-detail">
                  <span>Total Bookings</span>
                  <strong>{bookings.length}</strong>
                </div>
              </div>

              <button
                className="primary-btn"
                onClick={() => {
                  setPage("bookings");
                  fetchBookings(token);
                }}
              >
                View My Bookings
              </button>

              <button
                className="secondary-btn"
                onClick={() => setPage("movies")}
              >
                Back to Movies
              </button>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <p>
          © {new Date().getFullYear()} IMOVIES · Your movie experience.
        </p>
      </footer>
    </div>
  );
}

export default App;
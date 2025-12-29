# **Online Drive Web Application**

A Google Drive–like web application built with Node.js, Express, MongoDB, HTML, and CSS. The system supports user authentication, file and folder management, and a protected, session-based web interface.


# **Features:**

User authentication (sign up, login, logout, password reset)

Protected routes with middleware-based access control

File and folder management (upload, view, organize)

Responsive front-end using HTML and CSS

Session handling with cookies

RESTful API structure for auth and file operations


# **Tech Stack:**

Backend: Node.js, Express

Database: MongoDB (Mongoose)

Frontend: HTML, CSS

Authentication: Cookies + custom middleware

Version Control: Git & GitHub


# **Setup & Run**

## Prerequisites:

Node.js

MongoDB

## Steps:

### Clone the repository:

Clone the project to your local machine and move into the project directory.

### Install dependencies:

Run npm install to install all required Node.js packages.

### Environment configuration:

Make sure a .env file exists in the project root containing:

MONGODB_URI (MongoDB connection string)

PORT (default: 3000)

### Start the server:
Run node server.js to start the application.

### Access the application:
Open a browser and navigate to http://localhost:3000.

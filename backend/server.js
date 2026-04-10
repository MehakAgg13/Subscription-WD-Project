const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// MySQL connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "root",
    database: "subscription_db"
});

db.connect(err => {
    if (err)
        console.log("DB Error");
    else
        console.log("MySQL Connected");
});

// Test route
app.get("/", (req, res) => {
    res.send("Backend running");
});

// Start server
app.listen(5000, () => {
    console.log("Server running on port 5000");
});


//Signup API
app.post("/signup", (req, res) => {
    const { name, email, password } = req.body;
    const sql = "Insert into users (name,email,password) values (?, ?, ?) ";

    db.query(sql, [name, email, password], (err, result) => {
        if (err) {
            console.log(err);
            res.send("Error saving user");
        }
        else {
            res.send("Signup successful!!")
        }

        console.log(name, email, password);

    });

});



//Login API
app.post("/login", (req, res) => {
    const { email, password } = req.body;

    console.log("Login Data:", email, password); 

    const sql = "SELECT * FROM users WHERE email=? AND password=?";

    db.query(sql, [email, password], (err, result) => {
        if (err) {
            console.log(err);
            res.send("Error");
        }
        else if (result.length > 0) {
            res.send("Login successful");
        }
        else {
            console.log("No match found"); 
            res.send("Invalid credentials");
        }
    });
});


// FORGOT PASSWORD API
app.post("/forgot-password", (req, res) => {
    const { email, newPassword } = req.body;

    // Check if email exists
    const checkSql = "SELECT * FROM users WHERE email=?";
    
    db.query(checkSql, [email], (err, result) => {
        if (err) {
            console.log(err);
            return res.send("Error");
        }

        if (result.length === 0) {
            return res.send("Email not found");
        }

        // Update password
        const updateSql = "UPDATE users SET password=? WHERE email=?";
        
        db.query(updateSql, [newPassword, email], (err2, result2) => {
            if (err2) {
                console.log(err2);
                return res.send("Error updating password");
            }

            res.send("Password updated successfully");
        });
    });
});




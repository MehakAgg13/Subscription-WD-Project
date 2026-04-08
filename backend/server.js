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

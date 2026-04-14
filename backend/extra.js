const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const nextPaymentDateSql = `
    CASE
        WHEN sd.billing_cycle = 'Monthly' THEN
            CASE
                WHEN sd.start_date >= CURDATE() THEN sd.start_date
                ELSE DATE_ADD(
                    sd.start_date,
                    INTERVAL (
                        TIMESTAMPDIFF(MONTH, sd.start_date, CURDATE()) +
                        IF(
                            DATE_ADD(sd.start_date, INTERVAL TIMESTAMPDIFF(MONTH, sd.start_date, CURDATE()) MONTH) < CURDATE(),
                            1,
                            0
                        )
                    ) MONTH
                )
            END
        WHEN sd.billing_cycle = 'Quarterly' THEN
            CASE
                WHEN sd.start_date >= CURDATE() THEN sd.start_date
                ELSE DATE_ADD(
                    sd.start_date,
                    INTERVAL (
                        (TIMESTAMPDIFF(MONTH, sd.start_date, CURDATE()) DIV 3) * 3 +
                        IF(
                            DATE_ADD(
                                sd.start_date,
                                INTERVAL ((TIMESTAMPDIFF(MONTH, sd.start_date, CURDATE()) DIV 3) * 3) MONTH
                            ) < CURDATE(),
                            3,
                            0
                        )
                    ) MONTH
                )
            END
        WHEN sd.billing_cycle = 'Yearly' THEN
            CASE
                WHEN sd.start_date >= CURDATE() THEN sd.start_date
                ELSE DATE_ADD(
                    sd.start_date,
                    INTERVAL (
                        TIMESTAMPDIFF(YEAR, sd.start_date, CURDATE()) +
                        IF(
                            DATE_ADD(sd.start_date, INTERVAL TIMESTAMPDIFF(YEAR, sd.start_date, CURDATE()) YEAR) < CURDATE(),
                            1,
                            0
                        )
                    ) YEAR
                )
            END
        ELSE s.renewal_date
    END
`;

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "root",
    database: "subscription_db"
});

db.connect((err) => {
    if (err) {
        console.log("DB Error", err);
    } else {
        console.log("MySQL Connected");
    }
});

app.get("/", (req, res) => {
    res.send("Backend running");
});

app.get("/user/:id", (req, res) => {
    const user_id = req.params.id;
    const sql = "SELECT name, email FROM users WHERE user_id=?";

    db.query(sql, [user_id], (err, result) => {
        if (err) {
            return res.status(500).send("Error");
        }

        if (result.length > 0) {
            res.json(result[0]);
        } else {
            res.status(404).send("User not found");
        }
    });
});

app.post("/signup", (req, res) => {
    const { name, email, password } = req.body;
    const sql = "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";

    db.query(sql, [name, email, password], (err) => {
        if (err) {
            console.log(err);
            return res.status(500).send("Error saving user");
        }

        res.send("Signup successful!!");
    });
});

app.post("/login", (req, res) => {
    const { email, password } = req.body;
    const sql = "SELECT * FROM users WHERE email=? AND password=?";

    db.query(sql, [email, password], (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).send("Error");
        }

        if (result.length > 0) {
            res.json({
                message: "Login successful",
                user_id: result[0].user_id,
                email: result[0].email
            });
        } else {
            res.status(401).send("Invalid credentials");
        }
    });
});

app.post("/forgot-password", (req, res) => {
    const { email, newPassword } = req.body;
    const checkSql = "SELECT * FROM users WHERE email=?";

    db.query(checkSql, [email], (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).send("Error");
        }

        if (result.length === 0) {
            return res.status(404).send("Email not found");
        }

        const updateSql = "UPDATE users SET password=? WHERE email=?";

        db.query(updateSql, [newPassword, email], (err2) => {
            if (err2) {
                console.log(err2);
                return res.status(500).send("Error updating password");
            }

            res.send("Password updated successfully");
        });
    });
});

app.post("/add-subscription", (req, res) => {
    const {
        user_id,
        name,
        category,
        amount,
        billing_cycle,
        start_date,
        renewal_date,
        remind_before,
        notes,
        status
    } = req.body;
    const effectiveStartDate = start_date || renewal_date;

    if (!user_id || !name || !amount || !effectiveStartDate) {
        return res.status(400).send("Missing required fields");
    }

    const subscriptionSql = `
        INSERT INTO subscription (user_id, name, amount, renewal_date, status)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(
        subscriptionSql,
        [user_id, name, amount, effectiveStartDate, status || "active"],
        (subscriptionErr, subscriptionResult) => {
            if (subscriptionErr) {
                console.log(subscriptionErr);
                return res.status(500).send("Error adding subscription");
            }

            const detailsSql = `
                INSERT INTO subscription_details (
                    subscription_id,
                    category,
                    billing_cycle,
                    start_date,
                    remind_before,
                    notes
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `;

            db.query(
                detailsSql,
                [
                    subscriptionResult.insertId,
                    category || null,
                    billing_cycle || "Monthly",
                    effectiveStartDate,
                    Number(remind_before || 7),
                    notes || null
                ],
                (detailsErr) => {
                    if (detailsErr) {
                        console.log(detailsErr);
                        return res.status(500).send("Error saving subscription details");
                    }

                    res.send("Subscription added successfully!");
                }
            );
        }
    );
});

app.get("/subscriptions/:user_id", (req, res) => {
    const user_id = req.params.user_id;
    const sql = `
        SELECT
            s.*,
            sd.category,
            sd.billing_cycle,
            sd.start_date,
            sd.remind_before,
            sd.notes,
            ${nextPaymentDateSql} AS next_payment_date,
            DATEDIFF(${nextPaymentDateSql}, CURDATE()) AS days_left
        FROM subscription s
        LEFT JOIN subscription_details sd ON sd.subscription_id = s.id
        WHERE s.user_id=?
        ORDER BY next_payment_date ASC
    `;

    db.query(sql, [user_id], (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).send("Error fetching subscriptions");
        }

        res.json(result);
    });
});

app.delete("/delete-subscription/:id", (req, res) => {
    const id = req.params.id;
    const sql = "DELETE FROM subscription WHERE id=?";

    db.query(sql, [id], (err) => {
        if (err) {
            console.log(err);
            return res.status(500).send("Error deleting subscription");
        }

        res.send("Subscription deleted successfully!");
    });
});

app.put("/update-subscription/:id", (req, res) => {
    const id = req.params.id;
    const {
        name,
        category,
        amount,
        billing_cycle,
        start_date,
        renewal_date,
        remind_before,
        notes,
        status
    } = req.body;
    const effectiveStartDate = start_date || renewal_date;
    db.query(
        "UPDATE subscription SET name=?, amount=?, renewal_date=?, status=? WHERE id=?",
        [name, amount, effectiveStartDate, status, id],
        (subscriptionErr) => {
            if (subscriptionErr) {
                console.log(subscriptionErr);
                return res.status(500).send("Error updating subscription");
            }

            const detailsSql = `
                UPDATE subscription_details
                SET
                    category=?,
                    billing_cycle=?,
                    start_date=?,
                    remind_before=?,
                    notes=?
                WHERE subscription_id=?
            `;

            db.query(
                detailsSql,
                [
                    category || null,
                    billing_cycle || "Monthly",
                    effectiveStartDate,
                    Number(remind_before || 7),
                    notes || null,
                    id
                ],
                (detailsErr, detailsResult) => {
                    if (detailsErr) {
                        console.log(detailsErr);
                        return res.status(500).send("Error updating subscription details");
                    }

                    if (detailsResult.affectedRows === 0) {
                        const insertDetailsSql = `
                            INSERT INTO subscription_details (
                                subscription_id,
                                category,
                                billing_cycle,
                                start_date,
                                remind_before,
                                notes
                            )
                            VALUES (?, ?, ?, ?, ?, ?)
                        `;

                        return db.query(
                            insertDetailsSql,
                            [
                                id,
                                category || null,
                                billing_cycle || "Monthly",
                                effectiveStartDate,
                                Number(remind_before || 7),
                                notes || null
                            ],
                            (insertErr) => {
                                if (insertErr) {
                                    console.log(insertErr);
                                    return res.status(500).send("Error creating subscription details");
                                }

                                res.send("Subscription updated successfully!");
                            }
                        );
                    }

                    res.send("Subscription updated successfully!");
                }
            );
        }
    );
});

app.get("/total-spending/:user_id", (req, res) => {
    const user_id = req.params.user_id;
    const sql = "SELECT SUM(amount) AS total FROM subscription WHERE user_id=? AND status='active'";

    db.query(sql, [user_id], (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).send("Error calculating spending");
        }

        res.json({ total_monthly_spending: Number(result[0].total || 0) });
    });
});

app.get("/dashboard-summary/:user_id", (req, res) => {
    const user_id = req.params.user_id;

    const sql = `
        SELECT
            SUM(CASE WHEN sub.status = 'active' THEN 1 ELSE 0 END) AS activeSubscriptions,
            COALESCE(SUM(CASE WHEN sub.status = 'active' THEN sub.amount ELSE 0 END), 0) AS monthlySpending,
            SUM(
                CASE
                    WHEN sub.status = 'active'
                    AND DATEDIFF(calc.next_payment_date, CURDATE()) BETWEEN 0 AND COALESCE(sd.remind_before, 7)
                    THEN 1
                    ELSE 0
                END
            ) AS upcomingPayments
        FROM subscription sub
        LEFT JOIN subscription_details sd ON sd.subscription_id = sub.id
        JOIN (
            SELECT
                s.id,
                ${nextPaymentDateSql} AS next_payment_date
            FROM subscription s
            LEFT JOIN subscription_details sd ON sd.subscription_id = s.id
            WHERE s.user_id = ?
        ) calc ON calc.id = sub.id
        WHERE sub.user_id = ?
    `;

    db.query(sql, [user_id, user_id], (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ error: "Error loading dashboard summary" });
        }

        const summary = result[0] || {};
        const monthlySpending = Number(summary.monthlySpending || 0);

        res.json({
            activeSubscriptions: Number(summary.activeSubscriptions || 0),
            monthlySpending,
            upcomingPayments: Number(summary.upcomingPayments || 0),
            savedThisYear: Math.round(monthlySpending * 0.15)
        });
    });
});

app.get("/spending-trend/:user_id", (req, res) => {
    const user_id = req.params.user_id;

    const sql = `
        SELECT
            DATE_FORMAT(${nextPaymentDateSql}, '%b') AS monthLabel,
            MONTH(${nextPaymentDateSql}) AS monthNumber,
            YEAR(${nextPaymentDateSql}) AS yearNumber,
            COALESCE(SUM(s.amount), 0) AS total
        FROM subscription s
        LEFT JOIN subscription_details sd ON sd.subscription_id = s.id
        WHERE s.user_id = ?
        GROUP BY
            YEAR(${nextPaymentDateSql}),
            MONTH(${nextPaymentDateSql}),
            DATE_FORMAT(${nextPaymentDateSql}, '%b')
        ORDER BY yearNumber, monthNumber
        LIMIT 6
    `;

    db.query(sql, [user_id], (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ error: "Error loading spending trend" });
        }

        res.json({
            labels: result.map((row) => row.monthLabel),
            values: result.map((row) => Number(row.total || 0))
        });
    });
});

app.get("/reminders/:user_id", (req, res) => {
    const user_id = req.params.user_id;
    const sql = `
        SELECT
            s.*,
            sd.category,
            sd.billing_cycle,
            sd.start_date,
            sd.remind_before,
            sd.notes,
            ${nextPaymentDateSql} AS next_payment_date,
            DATEDIFF(${nextPaymentDateSql}, CURDATE()) AS days_left
        FROM subscription s
        LEFT JOIN subscription_details sd ON sd.subscription_id = s.id
        WHERE s.user_id=?
        AND s.status='active'
        AND DATEDIFF(${nextPaymentDateSql}, CURDATE()) BETWEEN 0 AND COALESCE(sd.remind_before, 7)
        AND COALESCE(sd.remind_before, 7) IN (3, 5, 7)
        ORDER BY next_payment_date ASC
    `;

    db.query(sql, [user_id], (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).send("Error fetching reminders");
        }

        if (result.length === 0) {
            return res.json({ upcoming_renewals: [] });
        }

        res.json({ upcoming_renewals: result });
    });
});

app.delete("/delete-user/:id", (req, res) => {
    const user_id = req.params.id;
    const deleteSubs = "DELETE FROM subscription WHERE user_id=?";
    const deleteUser = "DELETE FROM users WHERE user_id=?";

    db.query(deleteSubs, [user_id], (err) => {
        if (err) {
            return res.status(500).send("Error deleting subscriptions");
        }

        db.query(deleteUser, [user_id], (err2) => {
            if (err2) {
                return res.status(500).send("Error deleting user");
            }

            res.send("Account deleted successfully");
        });
    });
});

app.listen(5000, () => {
    console.log("Server running on port 5000");
});

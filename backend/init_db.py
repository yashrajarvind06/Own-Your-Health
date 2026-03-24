
import mysql.connector

def init_db():
    try:
        conn = mysql.connector.connect(
            host="localhost",
            user="root",
            password="Yashraj06"
        )
        cursor = conn.cursor()
        cursor.execute("CREATE DATABASE IF NOT EXISTS healthqr")
        print("Database 'healthqr' verified/created successfully.")
        conn.close()
    except Exception as e:
        print(f"Error initializing database: {e}")

if __name__ == "__main__":
    init_db()

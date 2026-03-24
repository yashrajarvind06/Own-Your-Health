import os
files = [
    r'c:\Yashraj\PICT_Hackathon\backend\app\routers\emergency.py',
    r'c:\Yashraj\PICT_Hackathon\backend\app\services\emergency_service.py',
    r'c:\Yashraj\PICT_Hackathon\backend\emergency_service.py'
]
for f in files:
    try:
        os.remove(f)
        print("Deleted:", f)
    except Exception as e:
        print("Error:", f, e)

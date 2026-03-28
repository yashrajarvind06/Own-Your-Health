from PIL import Image
import pytesseract

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

img = Image.open("test.png")
text = pytesseract.image_to_string(img, config="--oem 3 --psm 6")

print(text)

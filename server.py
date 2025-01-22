from flask import Flask, jsonify, send_from_directory, render_template
import os

app = Flask(__name__, static_folder='public', template_folder='public')

# Route for serving static files (CSS, JS)
@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)

@app.route('/images')
def get_images():
    images_dir = os.path.join(app.static_folder, 'images')
    try:
        files = os.listdir(images_dir)
        images = [file for file in files if file.lower().endswith(('.jpg', '.jpeg', '.png', '.gif'))]
        return jsonify(images)
    except Exception as e:
        print(f"Error scanning directory: {e}")  # Add this for debugging
        return jsonify({'error': 'Unable to scan directory'}), 500

@app.route('/images/<path:filename>')
def serve_image(filename):
    return send_from_directory(os.path.join(app.static_folder, 'images'), filename)

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    app.run(port=3000, debug=True)
# Ensure the script stops if any command fails
set -e

# Pull the latest code from the repository
echo "Pulling latest code from the repository..."
git pull

# Install/update dependencies
echo "Installing dependencies..."
npm install

# Start the Node.js application
echo "Starting the application..."
pm2 restart 0
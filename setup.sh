#!/bin/bash

echo "🚀 Integram Standalone - First Time Setup"
echo "=========================================="

# 1. Check dependencies
echo ""
echo "1️⃣ Checking dependencies..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi
echo "✅ Node.js $(node --version)"

if ! command -v npm &> /dev/null; then
    echo "❌ npm not found"
    exit 1
fi
echo "✅ npm $(npm --version)"

# 2. Install frontend dependencies
echo ""
echo "2️⃣ Installing frontend dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install frontend dependencies"
    exit 1
fi

# 3. Install backend dependencies
echo ""
echo "3️⃣ Installing backend dependencies..."
cd backend/monolith
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install backend dependencies"
    cd ../..
    exit 1
fi
cd ../..

# 4. Setup .env files
echo ""
echo "4️⃣ Setting up environment files..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env from .env.example"
else
    echo "⚠️  .env already exists, skipping"
fi

if [ ! -f backend/monolith/.env ]; then
    cp backend/monolith/.env.example backend/monolith/.env
    echo "✅ Created backend/monolith/.env from .env.example"
else
    echo "⚠️  backend/monolith/.env already exists, skipping"
fi

# 5. Verify project structure
echo ""
echo "5️⃣ Verifying project structure..."
if [ ! -d "src/components/landing" ]; then
    echo "⚠️  Warning: src/components/landing directory not found"
    echo "   This might be expected if landing components were moved or renamed"
else
    echo "✅ Landing components directory exists"
fi

# 6. Check PrimeVue imports
echo ""
echo "6️⃣ Checking PrimeVue configuration..."
if grep -q "primevue/resources/themes" src/main.js 2>/dev/null; then
    echo "⚠️  Warning: Found old PrimeVue imports in src/main.js"
    echo "   PrimeVue 4+ should use @primevue/themes instead of primevue/resources/themes"
else
    echo "✅ PrimeVue imports look good"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📚 Next steps:"
echo "   1. Edit .env files if needed:"
echo "      - Frontend: .env (VITE_API_URL, VITE_INTEGRAM_URL, etc.)"
echo "      - Backend: backend/monolith/.env (PORT, DATABASE_URL, API keys, etc.)"
echo ""
echo "   2. Start the backend server:"
echo "      Terminal 1: cd backend/monolith && npm run dev"
echo ""
echo "   3. Start the frontend server:"
echo "      Terminal 2: npm run dev"
echo ""
echo "   4. Open your browser:"
echo "      http://localhost:5173"
echo ""
echo "📖 For more information, see README.md"

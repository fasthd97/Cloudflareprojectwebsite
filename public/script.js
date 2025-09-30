// Frontend JavaScript for resume website with authentication

class ResumeApp {
    constructor() {
        this.apiUrl = `https://api.${window.location.hostname}`;
        this.token = localStorage.getItem('authToken');
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuthStatus();
        this.loadProtectedContent();
    }

    setupEventListeners() {
        // Login button
        document.getElementById('loginBtn').addEventListener('click', () => {
            this.showLoginModal();
        });

        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // Login form
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Close modal
        document.querySelector('.close').addEventListener('click', () => {
            this.hideLoginModal();
        });

        // Close modal on outside click
        document.getElementById('loginModal').addEventListener('click', (e) => {
            if (e.target.id === 'loginModal') {
                this.hideLoginModal();
            }
        });

        // Smooth scrolling for navigation links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                const target = document.querySelector(anchor.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
    }

    checkAuthStatus() {
        const loginBtn = document.getElementById('loginBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const protectedSection = document.getElementById('protected');

        if (this.token && this.isTokenValid()) {
            loginBtn.classList.add('hidden');
            logoutBtn.classList.remove('hidden');
            protectedSection.classList.remove('hidden');
        } else {
            loginBtn.classList.remove('hidden');
            logoutBtn.classList.add('hidden');
            protectedSection.classList.add('hidden');
            this.token = null;
            localStorage.removeItem('authToken');
        }
    }

    isTokenValid() {
        if (!this.token) return false;
        
        try {
            const payload = JSON.parse(atob(this.token.split('.')[1]));
            return payload.exp > Date.now();
        } catch {
            return false;
        }
    }

    showLoginModal() {
        document.getElementById('loginModal').classList.remove('hidden');
        document.getElementById('email').focus();
    }

    hideLoginModal() {
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('loginForm').reset();
    }

    async handleLogin() {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const submitBtn = document.querySelector('#loginForm button[type="submit"]');
        
        // Show loading state
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Logging in...';
        submitBtn.disabled = true;

        try {
            const response = await fetch(`${this.apiUrl}/api/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                localStorage.setItem('authToken', this.token);
                this.hideLoginModal();
                this.checkAuthStatus();
                this.loadProtectedContent();
                this.showNotification('Welcome back!', 'success');
            } else {
                this.showNotification(data.error || 'Login failed', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showNotification('Connection error. Please try again.', 'error');
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }

    logout() {
        this.token = null;
        localStorage.removeItem('authToken');
        this.checkAuthStatus();
        this.showNotification('Logged out successfully', 'success');
    }

    async loadProtectedContent() {
        if (!this.token || !this.isTokenValid()) return;

        try {
            await Promise.all([
                this.loadPhotos(),
                this.loadDocuments()
            ]);
        } catch (error) {
            console.error('Error loading protected content:', error);
        }
    }

    async loadPhotos() {
        try {
            const response = await fetch(`${this.apiUrl}/api/protected/photos`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const photos = await response.json();
                this.renderPhotos(photos);
            }
        } catch (error) {
            console.error('Error loading photos:', error);
        }
    }

    async loadDocuments() {
        try {
            const response = await fetch(`${this.apiUrl}/api/protected/documents`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const documents = await response.json();
                this.renderDocuments(documents);
            }
        } catch (error) {
            console.error('Error loading documents:', error);
        }
    }

    renderPhotos(photos) {
        const photoGallery = document.getElementById('photoGallery');
        
        if (photos.length === 0) {
            photoGallery.innerHTML = '<p>No photos available yet.</p>';
            return;
        }

        photoGallery.innerHTML = photos.map(photo => `
            <div class="photo-item" onclick="app.openPhotoModal('${photo.url}', '${photo.name}')">
                <img src="${this.apiUrl}${photo.url}" alt="${photo.name}" loading="lazy">
            </div>
        `).join('');
    }

    renderDocuments(documents) {
        const documentsList = document.getElementById('documentsList');
        
        if (documents.length === 0) {
            documentsList.innerHTML = '<p>No documents available yet.</p>';
            return;
        }

        documentsList.innerHTML = documents.map(doc => `
            <div class="doc-item">
                <span>${doc.name}</span>
                <a href="${this.apiUrl}${doc.url}" target="_blank" rel="noopener">Download</a>
            </div>
        `).join('');
    }

    openPhotoModal(url, name) {
        // Create photo modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 90vw; max-height: 90vh;">
                <span class="close">&times;</span>
                <img src="${this.apiUrl}${url}" alt="${name}" style="width: 100%; height: auto; max-height: 80vh; object-fit: contain;">
                <p style="text-align: center; margin-top: 15px; color: #64748b;">${name}</p>
            </div>
        `;

        document.body.appendChild(modal);

        // Close modal events
        const closeBtn = modal.querySelector('.close');
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });

        // Close on escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 6px;
            color: white;
            font-weight: 500;
            z-index: 3000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
            ${type === 'success' ? 'background: #10b981;' : ''}
            ${type === 'error' ? 'background: #ef4444;' : ''}
            ${type === 'info' ? 'background: #3b82f6;' : ''}
        `;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ResumeApp();
});

// Handle navigation highlighting
window.addEventListener('scroll', () => {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
    
    let current = '';
    sections.forEach(section => {
        const sectionTop = section.offsetTop - 100;
        if (window.pageYOffset >= sectionTop) {
            current = section.getAttribute('id');
        }
    });

    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${current}`) {
            link.classList.add('active');
        }
    });
});

// Fun facts for friends section
const funFacts = [
    "I once debugged a critical production issue while on a hiking trail using just my phone and a portable hotspot!",
    "My first program was a calculator that could only add numbers... and it took me 3 days to figure out why subtraction wasn't working 😅",
    "I have a rubber duck collection on my desk, and yes, I actually talk to them when debugging!",
    "I learned to code because I wanted to build a website for my pet hamster. The hamster is gone, but the passion for coding remains!",
    "I once spent 6 hours debugging an issue that turned out to be a missing semicolon. Now I have trust issues with punctuation.",
    "My code editor theme changes based on my mood. Dark mode for serious coding, light mode for creative projects!",
    "I maintain a personal wiki with over 500 coding tips and tricks I've learned over the years.",
    "Coffee is my debugging fuel, but tea is my creative coding companion ☕🍵",
    "I have a playlist called 'Coding Beats' with 847 songs. It's scientifically proven to increase productivity by 42%*. (*not actually proven)",
    "I once built a smart home system just to automate turning off lights when I forget. Laziness drives innovation!"
];

function refreshFact() {
    const factElement = document.getElementById('randomFact');
    const currentFact = factElement.textContent;
    let newFact;
    
    // Make sure we don't show the same fact twice in a row
    do {
        newFact = funFacts[Math.floor(Math.random() * funFacts.length)];
    } while (newFact === currentFact && funFacts.length > 1);
    
    // Add a little animation
    factElement.style.opacity = '0.5';
    setTimeout(() => {
        factElement.textContent = newFact;
        factElement.style.opacity = '1';
    }, 200);
}

// Make refreshFact available globally
window.refreshFact = refreshFact;

// Toggle expired certifications
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('toggleExpired');
    const expiredCerts = document.getElementById('expiredCerts');
    
    if (toggleBtn && expiredCerts) {
        toggleBtn.addEventListener('click', () => {
            const isVisible = expiredCerts.style.display !== 'none';
            
            if (isVisible) {
                // Hide expired certs
                expiredCerts.style.display = 'none';
                toggleBtn.classList.remove('active');
                toggleBtn.querySelector('.toggle-text').textContent = 'Show Expired Certifications';
            } else {
                // Show expired certs
                expiredCerts.style.display = 'block';
                expiredCerts.classList.add('show');
                toggleBtn.classList.add('active');
                toggleBtn.querySelector('.toggle-text').textContent = 'Hide Expired Certifications';
                
                // Smooth scroll to expired section
                setTimeout(() => {
                    expiredCerts.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'nearest' 
                    });
                }, 100);
            }
        });
    }
});
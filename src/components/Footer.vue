<template>
  <footer class="footer">
    <div class="footer-container">
      <div class="footer-content">
        <div class="footer-left">
          <h3 class="footer-logo">
            {{ footerNameParts[0] }}<br>{{ footerNameParts[1] }}
          </h3>
          <p class="footer-email">{{ brand.email }}</p>
        </div>

        <div class="footer-center">
          <div class="footer-links">
            <router-link
              v-for="link in footerLinks"
              :key="link.path"
              :to="link.path"
              class="footer-link"
            >
              {{ link.label }}
            </router-link>
          </div>
        </div>

        <div class="footer-right">
          <div class="social-section">
            <h4 class="social-title">go out</h4>
            <div class="social-links">
              <a
                v-for="social in socials"
                :key="social.label"
                :href="social.href"
                class="social-link"
                target="_blank"
                rel="noreferrer"
              >
                <span class="social-icon">{{ social.label.charAt(0) }}</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      <div class="footer-bottom">
        <p class="footer-copyright">
          Copyright © {{ new Date().getFullYear() }} {{ footerNameParts.join(' ') }}
        </p>
      </div>
    </div>
  </footer>
</template>

<script setup>
import { computed } from 'vue'
import { useSiteStore } from '../stores/site'

const store = useSiteStore()

const brand = computed(() => store.data?.brand ?? {
  name: 'combinilen Hub',
  email: 'anvapilot@combinilen.hub',
})

const footerNameParts = computed(() => {
  const parts = (brand.value.name || 'combinilen Hub').split(' ')
  return [parts[0] || 'combinilen', parts.slice(1).join(' ') || 'Hub']
})

const footerLinks = computed(() => store.data?.footer?.links ?? [
  { label: 'Contact', path: '/contact' },
  { label: 'Projects', path: '/projects' },
  { label: 'Services', path: '/services' },
])

const socials = computed(() => store.data?.footer?.socials ?? [])
</script>

<style scoped>
.footer {
  background: #1a1a1a;
  color: white;
  padding: 40px 40px 20px;
  font-family: 'Poppins', sans-serif;
}

.footer-container {
  max-width: 1200px;
  margin: 0 auto;
}

.footer-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 30px;
  flex-wrap: wrap;
  gap: 30px;
}

.footer-left {
  flex: 1;
  min-width: 200px;
}

.footer-logo {
  font-size: 24px;
  font-weight: 700;
  color: white;
  margin: 0 0 10px 0;
  line-height: 1.2;
}

.footer-email {
  color: #888;
  font-size: 14px;
  margin: 0;
}

.footer-center {
  flex: 1;
  min-width: 200px;
}

.footer-links {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.footer-link {
  color: white;
  text-decoration: none;
  font-size: 14px;
  transition: color 0.3s ease;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.footer-link:hover {
  color: #667eea;
}

.link-icon {
  font-size: 16px;
}

.footer-right {
  flex: 1;
  min-width: 200px;
  display: flex;
  justify-content: flex-end;
}

.social-section {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.social-title {
  color: white;
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  text-transform: none;
}

.social-links {
  display: flex;
  gap: 15px;
  align-items: center;
}

.social-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #333;
  color: white;
  text-decoration: none;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.3s ease;
  cursor: pointer;
}

.social-link:hover {
  background: #667eea;
  transform: translateY(-2px);
}

.footer-bottom {
  border-top: 1px solid #333;
  padding-top: 20px;
  text-align: center;
}

.footer-copyright {
  color: #888;
  font-size: 13px;
  margin: 0;
}
</style>

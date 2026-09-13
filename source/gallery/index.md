---
title: 相册
date: 2026-09-13 23:33:08
type: gallery
comments: false
---

<style>
.gallery-wrap {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}
.gallery-title {
  text-align: center;
  font-size: 2em;
  font-weight: 700;
  margin: 30px 0 10px;
  color: var(--theme-color);
}
.gallery-subtitle {
  text-align: center;
  color: #888;
  font-size: 0.95em;
  margin-bottom: 40px;
}
.gallery-category {
  margin-bottom: 50px;
}
.gallery-category-title {
  font-size: 1.3em;
  font-weight: 600;
  margin-bottom: 15px;
  padding-left: 12px;
  border-left: 4px solid var(--theme-color);
}
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 15px;
}
.gallery-item {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.gallery-item:hover {
  transform: scale(1.02);
  box-shadow: 0 8px 25px rgba(0,0,0,0.15);
}
.gallery-item img {
  width: 100%;
  height: 200px;
  object-fit: cover;
  display: block;
}
.gallery-item .gallery-caption {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0,0,0,0.7));
  color: #fff;
  padding: 30px 15px 10px;
  font-size: 0.9em;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.gallery-item:hover .gallery-caption {
  opacity: 1;
}
.gallery-lightbox {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.9);
  z-index: 9999;
  justify-content: center;
  align-items: center;
  cursor: pointer;
}
.gallery-lightbox.active {
  display: flex;
}
.gallery-lightbox img {
  max-width: 90%;
  max-height: 85vh;
  border-radius: 4px;
}
.gallery-lightbox .lightbox-close {
  position: absolute;
  top: 20px;
  right: 30px;
  color: #fff;
  font-size: 2em;
  cursor: pointer;
}
</style>

<div class="gallery-wrap">
  <h2 class="gallery-title">📷 我的相册</h2>
  <p class="gallery-subtitle">记录生活中的美好瞬间</p>

  <div class="gallery-category">
    <h3 class="gallery-category-title">🌅 风景</h3>
    <div class="gallery-grid">
      <div class="gallery-item" onclick="openLightbox(this)">
        <img src="https://images.unsplash.com/photo-1506905925346-21b34b1b1e48?w=500" alt="山间日落">
        <div class="gallery-caption">山间日落 · 2026秋</div>
      </div>
      <div class="gallery-item" onclick="openLightbox(this)">
        <img src="https://images.unsplash.com/photo-1470079563030-3efc36bfee5e?w=500" alt="云海">
        <div class="gallery-caption">云海日出</div>
      </div>
      <div class="gallery-item" onclick="openLightbox(this)">
        <img src="https://images.unsplash.com/photo-1441974237511-053ecaf8d1c4?w=500" alt="森林">
        <div class="gallery-caption">林间漫步</div>
      </div>
      <div class="gallery-item" onclick="openLightbox(this)">
        <img src="https://images.unsplash.com/photo-1501785953782-3f527e4ba9ac?w=500" alt="湖边">
        <div class="gallery-caption">湖光山色</div>
      </div>
    </div>
  </div>

  <div class="gallery-category">
    <h3 class="gallery-category-title">🐱 生活</h3>
    <div class="gallery-grid">
      <div class="gallery-item" onclick="openLightbox(this)">
        <img src="https://images.unsplash.com/photo-1514888286741-3e4b7a3e3e3e?w=500" alt="咖啡">
        <div class="gallery-caption">午后咖啡</div>
      </div>
      <div class="gallery-item" onclick="openLightbox(this)">
        <img src="https://images.unsplash.com/photo-1441986300917-46b2e5c5e3e3?w=500" alt="书桌">
        <div class="gallery-caption">我的书桌</div>
      </div>
      <div class="gallery-item" onclick="openLightbox(this)">
        <img src="https://images.unsplash.com/photo-1493663284923-1b294fb8f1e8?w=500" alt="美食">
        <div class="gallery-caption">周末美食</div>
      </div>
      <div class="gallery-item" onclick="openLightbox(this)">
        <img src="https://images.unsplash.com/photo-1513475382585-d8cc4d8755e3?w=500" alt="花">
        <div class="gallery-caption">路边的花</div>
      </div>
    </div>
  </div>

  <div class="gallery-category">
    <h3 class="gallery-category-title">🎮 爱好</h3>
    <div class="gallery-grid">
      <div class="gallery-item" onclick="openLightbox(this)">
        <img src="https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500" alt="游戏">
        <div class="gallery-caption">游戏时光</div>
      </div>
      <div class="gallery-item" onclick="openLightbox(this)">
        <img src="https://images.unsplash.com/photo-1526374965114-3d9a8c8c1ae8?w=500" alt="DIY">
        <div class="gallery-caption">DIY作品</div>
      </div>
      <div class="gallery-item" onclick="openLightbox(this)">
        <img src="https://images.unsplash.com/photo-1503602643158-05e1d4e3b9c3?w=500" alt="收藏">
        <div class="gallery-caption">我的收藏</div>
      </div>
      <div class="gallery-item" onclick="openLightbox(this)">
        <img src="https://images.unsplash.com/photo-1605360391814-05e1d4e3b9c3?w=500" alt="手工">
        <div class="gallery-caption">手工作品</div>
      </div>
    </div>
  </div>
</div>

<div class="gallery-lightbox" id="galleryLightbox" onclick="closeLightbox()">
  <span class="lightbox-close">&times;</span>
  <img src="" alt="" id="lightboxImg">
</div>

<script>
function openLightbox(item) {
  var img = item.querySelector('img');
  var lightbox = document.getElementById('galleryLightbox');
  var lightboxImg = document.getElementById('lightboxImg');
  lightboxImg.src = img.src;
  lightbox.classList.add('active');
}
function closeLightbox() {
  document.getElementById('galleryLightbox').classList.remove('active');
}
</script>

const fs = require('fs');
const axios = require('axios');

const CAROUSEL_URL = 'https://fouanistore.com/_next/data/GO-3r8YXmGfG25XhVX0rj/en.json';
const OUTPUT_FILE = 'carousel_banners.json';

function buildImageUrls(image) {
  if (!image?.base_url || !image?.origin || !image?.thumbnail) return null;
  return {
    base_url_origin: `${image.base_url}/${image.origin}`,
    base_url_thumbnail: `${image.base_url}/${image.thumbnail}`
  };
}

async function fetchCarouselBanners() {
  try {
    console.log('🎠 Fetching carousel banners...');

    const response = await axios.get(CAROUSEL_URL, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 20000
    });

    const widgets = response?.data?.pageProps?.widgets;
    if (!Array.isArray(widgets)) {
      console.warn('⚠️ No widgets found in response.');
      return;
    }

    // Get the first widget that contains a list of banners
    const firstBannersList = widgets.find(w => Array.isArray(w?.model?.banners))?.model?.banners;

    if (!Array.isArray(firstBannersList)) {
      console.warn('⚠️ No banner list found.');
      return;
    }

    const banners = firstBannersList.map(banner => {
      const webImage = buildImageUrls(banner.webImage);
      const mobileImage = buildImageUrls(banner.mobileImage);

      return {
        id: banner.webImage?.id || null,
        title: banner.title || '',
        description: banner.description || '',
        buttonText: banner.buttonText || '',
        buttonAction: banner.buttonAction || null,
        ...(webImage && { webImage }),
        ...(mobileImage && { mobileImage })
      };
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ banners }, null, 2));
    console.log(`✅ Done! Saved ${banners.length} banners to ${OUTPUT_FILE}`);

  } catch (error) {
    console.error('❌ Error fetching carousel banners:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

fetchCarouselBanners();

# Android par deploy karne ka simple guide

**Pehle backup:** apne GitHub repository ki current `index.html` ki copy download/save kar lo. Live site par directly bina backup replace mat karna.

1. ZIP ko phone mein download karo aur extract karne wali app se khol lo. Project mein `public`, `functions`, `migrations` folders hain. Sirf `public/index.html` upload karna kaafi nahi hai; backend files bhi chahiye.
2. GitHub repository mein project ke folders/files ko isi structure mein upload karo. `functions` folder repository ke main/root level par hona chahiye; `public` ke andar nahi.
3. Cloudflare Pages project ki Build settings mein **Root directory blank**, **Build command blank**, aur **Build output directory `public`** rakho. Preview deployment ke liye `luxury-company-redesign` branch enable honi chahiye. Production branch `main` hi rehne do.
4. Pehle se banaye gaye `kk-bakery-db` database ko use karo; naya duplicate database mat banao. Sirf tab `migrations/schema.sql` run karo jab required tables missing hon. Existing initialized database par bina wajah SQL dobara mat chalao.
5. Cloudflare R2 mein `kk-bakery-images` bucket banao. Pages project → Settings → Bindings mein D1 binding ka variable name `DB` aur R2 binding ka variable name `BAKERY_IMAGES` rakho. Dono ko sahi database/bucket se connect karo.
6. Pages project → Settings → Variables and Secrets mein `OWNER_PASSWORD` aur `SESSION_SECRET` ko **Secret** ke roop mein add karo. Password tum apne liye private rakho; secret chat ya GitHub par mat likho. `SESSION_SECRET` kam-se-kam 32 random characters ka ho.
7. Bindings aur secrets add karne ke baad redeploy karo. Website ke URL ke aage `/api/bootstrap` khol kar dekho. `backendReady: true` aaye tab backend configured hai. Agar `false` ho to `missing` mein jo bataya gaya hai use fix karo.
8. Do phones par test karo: Owner Dashboard mein sign in karo, ek sample item ki price update karke save karo, doosre phone par 15 seconds ke andar update check karo. Ek test order place karke owner panel aur order tracking bhi check karo.

**Important:** downloaded HTML file ko Chrome se direct kholne par shared database kaam nahi karega. Full-stack features Cloudflare par backend deploy aur configure hone ke baad hi work karenge. Account setup se pehle isse live customer orders ke liye use mat karna.

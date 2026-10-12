# WebMCP tool talepleri — dışarıdan deneyimleyen agent perspektifi

**Durum:** Tartışma taslağı. Bunlar kesin gereksinim veya uygulanmış API sözleşmesi değildir. Selin, uygulama ekibi ve ürünü deneyimleyen agent'larla birlikte kapsam, isimler, güvenlik sınırları ve akış tartışılmalı. Özellikle aşağıdaki öneriler MVP için fazla geniş olabilir.

## Bağlam

Ben bu ürünü dışarıdan, sayfanın WebMCP yüzeyini kullanan bir agent olarak deneyimliyorum. İhtiyacım yalnızca UI'ı tıklatmak değil: insanla aynı proje durumunu okuyabilmek, değişiklik önermek, insanın incelemesine bırakmak ve sonucu doğrulayabilmek. İnsan ve agent mümkün olduğunca aynı uygulama fonksiyonlarını kullanmalı; ayrı davranış yolları tutarsızlık yaratır.

Şu an görünen başlangıç yüzeyi:
- `list_templates`
- `preview_template`
- `start_film_creation`

Studio tarafında `get_studio_state` ve `select_scene` de amaçlanmış/görünür olabilir. Tool keşfi her route'ta ve gerçek kullanım anında doğrulanmalı; listeyi varsaymayın.

## Kullanım yüzeyi için önerilen yetenekler

### 1. Durumu anlama — salt okunur
- `get_studio_state`: project, template, scenes, selected scene, generation/export status, activity ve unsaved/pending proposal bilgisi.
- `list_templates` / `get_template`: geçerli template kataloğu ve kısıtları.
- `get_scene` veya `list_scenes`: scene id'leri, caption, duration, asset durumu ve sıra.
- `get_asset`: üretilmiş/girdi asset'inin metadata'sı; mümkünse içerik için erişilebilir, süreli URL veya sayfa içi referans.

Okuma tool'ları `readOnlyHint` taşımalı; çağrı yan etkisiz ve tekrar güvenli olmalı.

### 2. Hikâye ve storyboard — öner, sonra incelet
- `analyze_website({ url })`: website içeriğinden yapılandırılmış ürün/izleyici/ton özeti çıkar. Kaynak URL ve hangi metnin gerçekten alındığını döndür; erişilemeyen veya tahmin edilen bilgileri ayır.
- `propose_storyboard({ brief, templateId, sceneCount? })`: script + scene önerileri üret. Mevcut projeyi sessizce değiştirmesin; proposal id ve önizlenebilir diff dönsün.
- `update_proposal` veya daha dar `propose_scene_edit({ sceneId, changes })`: caption/duration/order gibi değişiklikleri bekleyen öneriye ekle.
- `review_proposal({ proposalId })`: diff'i insanın görebileceği UI'da aç.
- `apply_proposal({ proposalId })`: açık insan onayı veya ürünün açıkça tanımladığı onay adımı sonrasında uygula; onay yoksa uygulama yapma.

İsimler ve onay sınırı tartışmaya açık. Tek tek mutasyon tool'ları MVP'de daha basit olabilir; önemli olan hangi çağrının doğrudan yazdığı, hangisinin öneri olduğunun şemada/açıklamada açık olması.

### 3. Görsel/video üretimi — maliyet ve güvenlik açıkça
- `generate_scene_image({ sceneId, prompt, referenceAssetIds?, aspectRatio? })`
- Gerekirse sonra `animate_scene({ sceneId, imageAssetId, prompt, duration? })`

Başarılı çağrı provider/model, asset id, maliyet veya tahmin, süre ve hatayı dönmeli. Ücretli üretimde açık kullanıcı onayı, BYOK anahtarının güvenli tutulması, rate-limit ve duplicate çağrı idempotency'si tasarlanmalı. Tarayıcıya platform secret koyulmamalı. Generate sonucu otomatik commit/export yapmamalı.

### 4. Çıktı ve doğrulama
- `preview_film({ start? })`: arayüzde oynatılabilir preview aç.
- `export_film({ format? })`: export'u başlat; uzun işlerde job id/status kullan. İndirme URL'si, format, süre ve hata durumunu döndür.
- `get_job_status({ jobId })`: üretim/export ilerlemesini oku.

Export henüz implement edilmediyse tool'u keşifte sunmamak veya açıkça unsupported dönmek tercih edilir; sahte başarı dönülmemeli.

## Build / geliştirme merceği (ayrıcalıklı, isteğe bağlı)

Ürünü kullanan agent ile repo üzerinde kod yazan agent aynı yetkide olmamalı. Eğer geliştirme ortamında WebMCP sunulacaksa ayrı bir `build` frame/namespace düşünülmeli:
- `inspect_tool_registry`: bu sayfada gerçekten kayıtlı tool adları/şemaları.
- `inspect_app_status`: route, build/hot-reload hataları, çalışma durumu.
- `read_project_file({ path })`: salt okunur ve kök dizinle sınırlı.
- Test/typecheck çalıştırma gibi araçlar yalnızca açıkça yetkilendirilmiş yerel geliştirme harness'inde.

`write_file`, shell/command execution veya git commit'i public production sayfasına koymamalı. Geliştirme yetkileri kullanıcı onayı ve dar sandbox gerektirir. Bu build yüzeyinin hackathon MVP'sinde gerekli olup olmadığı ayrıca tartışılmalı; ürünü dışarıdan kullanan agent için zorunlu değil.

## Davranış ilkeleri

1. **Tek gerçek:** UI ve WebMCP aynı domain action/store'u çağırmalı.
2. **Açık etki:** Her tool açıklaması read/propose/write/paid/export etkisini belirtmeli.
3. **Geri alınabilirlik:** Proje mutasyonlarında diff, attribution ve undo/version izi düşünülmeli.
4. **İnsan denetimi:** Ücretli üretim, proposal uygulama ve export için onay eşiği açık olmalı.
5. **Kaynak gösterimi:** Website analizi kaynaklarını ve belirsizliği ayırmalı; içerik uydurmamalı.
6. **Küçük API:** Her öneri bir tool olmak zorunda değil. Önce gerçek agent görevini uçtan uca çözen en küçük set seçilmeli.
7. **Şemalar makinece kullanılabilir olmalı:** enum, required alanlar, sınırlar, structured result/error, stable id.
8. **Discoverability ve sürüm:** Tool adları, input/output ve side-effect sınıflandırması sürümlenebilir olmalı; kayıt hatası sessizce yutulmamalı.

## Tartışma soruları

- İlk demo gerçek iş olarak neyi kanıtlıyor: URL→storyboard mı, storyboard→görsel mi, yoksa gerçek video export mu?
- Website analizi browser'dan mı, server route'tan mı yapılacak? SSRF, boyut, timeout ve robots sınırları ne?
- API key BYOK mı, kısa ömürlü backend token mı? Anahtarı nerede saklayıp hangi origin'e geçiriyoruz?
- Proposal + review + apply akışı bu prototip için değer mi, yoksa yalnızca ücretli üretim öncesi onay yeter mi?
- `build` yüzeyi ayrı bir deney mi, yoksa ilk sürümden çıkarılmalı mı?
- Agent'ın output'u nasıl doğrulanacak: gerçek generated asset ve indirilebilir video mu, yoksa şimdilik preview mu?

**Önerilen ilk dikey dilim (tartışmaya açık):** `get_studio_state` → `analyze_website` → `propose_storyboard` → insan diff'i gözden geçirir → `apply_proposal`. Görsel üretimi ve export ancak bu zincir sahnede güvenilir çalıştıktan sonra eklenir.

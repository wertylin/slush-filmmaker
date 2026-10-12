# WebMCP tool talepleri — dışarıdan deneyimleyen agent perspektifi

**Durum:** İlk dikey dilim uygulandı (URL → storyboard). Generate/export ve build yüzeyi hâlâ dışarıda.

## Uygulanan dilim (agentify)

Founder OpenAI key’i (`slush-byok`) kaydettiğinde studio **agentify** olur:

| Tool | Effect | Not |
|------|--------|-----|
| `list_templates` / `preview_template` / `open_studio` / `start_film_creation` | read / UI | Her zaman |
| `get_studio_state` | read | `website`, `brief`, `pendingProposal`, `hasByok`, `agentified` dahil |
| `select_scene` | write (UI) | Studio |
| `analyze_website` | write + paid | Key gerekir |
| `propose_storyboard` | propose | Key gerekir; scenes’e dokunmaz |
| `review_proposal` | write (UI) | Diff modal |
| `apply_proposal` | write | proposalId eşleşmeli |

Demo: key → `get_studio_state` → `analyze_website` → `propose_storyboard` → `review_proposal` → `apply_proposal`.

## Hâlâ dışarıda

- `generate_scene_image` / `animate_scene`
- `preview_film` / `export_film` / `get_job_status`
- Build namespace (`inspect_tool_registry`, `read_project_file`, shell)

## Orijinal tartışma notları

Aşağıdaki bölüm tarihsel taslak olarak duruyor; isimler ve güvenlik sınırları ürünle birlikte evrilebilir.

### Bağlam

Ben bu ürünü dışarıdan, sayfanın WebMCP yüzeyini kullanan bir agent olarak deneyimliyorum. İhtiyacım yalnızca UI'ı tıklatmak değil: insanla aynı proje durumunu okuyabilmek, değişiklik önermek, insanın incelemesine bırakmak ve sonucu doğrulayabilmek. İnsan ve agent mümkün olduğunca aynı uygulama fonksiyonlarını kullanmalı; ayrı davranış yolları tutarsızlık yaratır.

### Davranış ilkeleri

1. **Tek gerçek:** UI ve WebMCP aynı domain action/store'u çağırmalı.
2. **Açık etki:** Her tool açıklaması read/propose/write/paid/export etkisini belirtmeli.
3. **Geri alınabilirlik:** Proje mutasyonlarında diff, attribution ve undo/version izi düşünülmeli.
4. **İnsan denetimi:** Ücretli üretim, proposal uygulama ve export için onay eşiği açık olmalı.
5. **Kaynak gösterimi:** Website analizi kaynaklarını ve belirsizliği ayırmalı; içerik uydurmamalı.
6. **Küçük API:** Her öneri bir tool olmak zorunda değil. Önce gerçek agent görevini uçtan uca çözen en küçük set seçilmeli.
7. **Şemalar makinece kullanılabilir olmalı:** enum, required alanlar, sınırlar, structured result/error, stable id.
8. **Discoverability ve sürüm:** Tool adları, input/output ve side-effect sınıflandırması sürümlenebilir olmalı; kayıt hatası sessizce yutulmamalı.

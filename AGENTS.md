<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Chat archives are private: parse and store them only in the browser (IndexedDB via `src/lib/mae/store.ts`); never send them to a server/AI, commit them, or put them in `public/`. Why: user-required privacy.
- Pure date/session logic lives in `src/lib/mae/{time,analysis,parse}.ts` with tests in `mae.test.ts`; UI never re-implements it. Why: Tehran/Jalali correctness is tested in one place.
- Tehran time uses a fixed UTC+3:30 offset (Iran dropped DST in 2022). Why: deterministic day boundaries.
- Tests use synthetic data only, never the real archive.

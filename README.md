# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.


## Hockey exercise photo import

In **Nieuwe oefening toevoegen** (super admin), use **Foto kiezen** and choose either:

- **Originele foto**: uploads the selected JPG/PNG/WebP to the existing public `exercise-previews` Supabase Storage bucket, then stores its URL in `exercises.image_url` when the exercise is saved.
- **AI natekenen**: sends the photo to the `analyze-exercise-photo` Supabase Edge Function. AI suggests exercise text and editable `board_layout.items` for the existing board editor. Review and correct before saving. A generated board preview is stored using the existing preview uploader.

**AI setup (required before first use)**

The public app must never contain an OpenAI API key. The Supabase function uses the server-side secret `OPENAI_API_KEY`, with an authenticated `super_admin` authorization check.

1. Obtain an OpenAI API key with available API credits (ChatGPT subscription does not include API credits). AI analysis incurs usage charges.
2. Add `OPENAI_API_KEY` as an Edge Function secret in the **HC Winsum** Supabase project (via the Supabase dashboard, or `supabase secrets set OPENAI_API_KEY=...` in a secure terminal). Do not add secrets to GitHub or commit them.
3. Deploy the new function from this repository using `supabase functions deploy analyze-exercise-photo --project-ref shllbltitjogepjeyxdr` after logging in with the Supabase CLI.
4. Deploy the Expo app via the normal GitHub Pages workflow after merging the PR.

The storage bucket `exercise-previews` must exist and permit authenticated uploads; the current HC Winsum Supabase project already has this bucket. Imported images are public, so avoid uploading photos containing personal or sensitive information. The AI result is an approximation and should be inspected before saving.

**Manual checks:** (1) import a photo, enter title/category/difficulty, save and open it from the exercise library; (2) analyze an actual drill image, inspect/edit players and lines, save and verify the board preview; (3) cancel an image selection; (4) verify a non-admin cannot call the Edge Function; (5) confirm a missing API key reports a configuration error.

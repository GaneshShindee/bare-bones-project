
CREATE POLICY "resume-latex owner read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'resume-latex' AND owner = auth.uid());
CREATE POLICY "resume-latex owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resume-latex' AND owner = auth.uid());
CREATE POLICY "resume-latex owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'resume-latex' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'resume-latex' AND owner = auth.uid());
CREATE POLICY "resume-latex owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'resume-latex' AND owner = auth.uid());

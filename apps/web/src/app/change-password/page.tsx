'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { changePasswordSchema } from '@cafe-pos/contracts';
import { z } from 'zod';
import { Button, Card, Input, Notice } from '../../components/ui';
import { api } from '../../lib/api';

type Form = z.infer<typeof changePasswordSchema>;
export default function ChangePasswordPage() {
  const router = useRouter(); const [message,setMessage]=useState('');
  const {register,handleSubmit,formState:{errors,isSubmitting}}=useForm<Form>({resolver:zodResolver(changePasswordSchema)});
  const submit=handleSubmit(async values=>{ try { await api('/auth/change-temporary-password',{method:'POST',body:JSON.stringify(values)}); sessionStorage.removeItem('csrf'); router.push('/login'); } catch(error){setMessage(error instanceof Error?error.message:'Unable to change password.');} });
  return <main className="setup"><Card><div className="page-title"><h1>Choose a permanent password</h1><p>Your temporary password must be replaced before you can continue.</p></div>{message&&<Notice>{message}</Notice>}<form onSubmit={submit}><Input label="Current temporary password" type="password" error={errors.currentPassword?.message} {...register('currentPassword')}/><Input label="New password" type="password" error={errors.newPassword?.message} {...register('newPassword')}/><Button disabled={isSubmitting}>{isSubmitting?'Saving…':'Change password'}</Button></form></Card></main>;
}

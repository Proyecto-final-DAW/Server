import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";


export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
   const header = req.headers.authorization;

   if (!header) {
      res.status(401).json({ error: "No se proporcionó token" });
      return;
   }

   const token = header.split(" ")[1];

   try {
      const payload = jwt.verify(token, process.env.JWT_SECRET as string);
      (req as any).user = payload;
      next();
   } catch (error) {
      res.status(401).json({ error: "Token inválido o expirado" });
      return;
   }
};
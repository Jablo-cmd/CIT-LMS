import { Router } from "express";
import { prisma } from "../db";
import { isOwner } from "../middleware/auth";

export const auditRouter = Router();
auditRouter.use(isOwner);
auditRouter.get("/", async (req,res,next)=>{
  try {
    const entityType=typeof req.query.entityType==="string"?req.query.entityType:undefined;
    const userId=typeof req.query.userId==="string"?req.query.userId:undefined;
    const items=await prisma.auditLog.findMany({
      where:{...(entityType?{entityType}:{}),...(userId?{userId}:{})},
      include:{user:{select:{fullName:true,email:true}}},
      orderBy:{createdAt:"desc"},take:200
    });
    return res.json({items});
  }catch(e){return next(e);}
});
